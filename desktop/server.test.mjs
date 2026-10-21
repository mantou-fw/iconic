import { expect, test } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { startBackend } from './server.mjs';
const freePort = async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
};
const fixture = async script => {
  const directory = await mkdtemp(path.join(tmpdir(),'iconic-node-test-'));
  const filename = path.join(directory,'server.mjs'); await writeFile(filename,script); return { directory,filename };
};
const healthServer = `import { createServer } from 'node:http';createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({service:'iconic',instance:process.env.ICONIC_INSTANCE}));}).listen(Number(process.env.PORT),'127.0.0.1');`;
test('owns a ready Node child and releases its port when stopped',async()=>{
  const {directory,filename}=await fixture(healthServer);
  try {
    const server=await startBackend({executable:process.execPath,args:[filename],cwd:directory,port:await freePort(),production:true,timeout:3000});
    expect((await (await fetch(`${server.url}/health`)).json()).service).toBe('iconic');
    await server.stop();await server.stop();
    await expect(fetch(`${server.url}/health`)).rejects.toThrow();
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('rejects an occupied service without shutting it down',async()=>{
  const occupied=createServer((req,res)=>res.end(JSON.stringify({service:'iconic',instance:'other'})));
  await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));
  const {directory,filename}=await fixture(healthServer);
  try {
    await expect(startBackend({executable:process.execPath,args:[filename],cwd:directory,port:occupied.address().port,production:true,timeout:3000})).rejects.toThrow('could not start');
    expect((await (await fetch(`http://127.0.0.1:${occupied.address().port}/health`)).json()).instance).toBe('other');
  } finally {await new Promise(resolve=>occupied.close(resolve));await rm(directory,{recursive:true,force:true});}
});
test('cancels startup and reaps the Node child',async()=>{
  const {directory,filename}=await fixture('setInterval(()=>{},1000)');
  const abort=new AbortController();
  const task=startBackend({executable:process.execPath,args:[filename],cwd:directory,port:await freePort(),production:true,timeout:3000,signal:abort.signal});abort.abort();
  try {await expect(task).rejects.toThrow('cancelled');}finally {await rm(directory,{recursive:true,force:true});}
});
