import { expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOptions, setupPlan, registerAgent, findLauncher } from './setup-agent.mjs';

test('validates local URL and emits isolated argument arrays for paths with spaces', () => {
  const options = parseOptions(['--agent','codex','--url','http://127.0.0.1:8123/','--with-skill','--dry-run']);
  const plan = setupPlan(options,'/tmp/AV pack $(not-shell)',process.execPath);
  expect(plan.config.mcpServers['av-schematic'].env.AV_CANVAS_URL).toBe('http://127.0.0.1:8123');
  expect(plan.registration.args.at(-1)).toBe('/tmp/AV pack $(not-shell)/mcp/server.mjs');
  expect(plan.skill.args).toContain('/tmp/AV pack $(not-shell)');
  for (const url of ['https://localhost','http://example.com','http://user@localhost','http://localhost/path','http://localhost?token=x']) expect(() => parseOptions(['--agent','codex','--url',url])).toThrow();
  expect(() => parseOptions(['--agent','generic','--with-skill'])).toThrow();
});
test('refuses a different existing registration without executing writes', async () => {
  const options = parseOptions(['--agent','codex']);
  let writes = 0;
  await expect(registerAgent(options,setupPlan(options),{inspect:async()=>({command:'/other/node',args:['/other/server.mjs']}),execute:async()=>{writes++;return {code:0};}})).rejects.toThrow('--replace');
  expect(writes).toBe(0);
});
test('keeps an identical registration without rewriting it', async () => {
  const options = parseOptions(['--agent','codex']);
  const plan = setupPlan(options);
  let writes = 0;
  await registerAgent(options,plan,{inspect:async()=>plan.config.mcpServers['av-schematic'],execute:async()=>{writes++;return {code:0};},log:()=>{}});
  expect(writes).toBe(0);
});
test('restores the previous Claude user entry when replacement fails', async () => {
  const options = parseOptions(['--agent','claude-code','--replace']);
  const previous = {type:'stdio',command:'/previous/node',args:['/previous/server.mjs']};
  const calls = [];
  await expect(registerAgent(options,setupPlan(options),{
    inspect:async()=>previous,
    execute:async(command,args)=>{calls.push({command,args});return {code:calls.length===2?1:0};},
  })).rejects.toThrow('registration failed');
  expect(calls[0].args).toEqual(['mcp','remove','av-schematic','--scope','user']);
  expect(JSON.parse(calls[2].args.at(-1))).toEqual(previous);
});
test('resolves Windows npm shims without invoking a shell', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'iconic-shim-'));
  try {
    await mkdir(path.join(directory,'node_modules','example','bin'),{recursive:true});
    await writeFile(path.join(directory,'node_modules','example','bin','cli.js'),'');
    await writeFile(path.join(directory,'codex.cmd'),'@"%dp0%\\node_modules\\example\\bin\\cli.js" %*');
    const launcher = await findLauncher('codex',{PATH:directory},'win32');
    expect(launcher.command).toBe(process.execPath);
    expect(launcher.prefix).toEqual([path.join(directory,'node_modules','example','bin','cli.js')]);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('dry-run executes through a symlinked script path without changing settings', async () => {
  const { symlink } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const directory = await mkdtemp(path.join(tmpdir(),'iconic-setup-link-'));
  try {
    const script = path.join(directory,'setup.mjs');
    await symlink(fileURLToPath(new URL('./setup-agent.mjs',import.meta.url)),script);
    const { stdout } = await promisify(execFile)(process.execPath,[script,'--agent','generic','--dry-run']);
    const plan = JSON.parse(stdout);
    expect(plan.registration).toBe(null);
    expect(plan.config.mcpServers['av-schematic'].command).toBe(process.execPath);
  } finally {await rm(directory,{recursive:true,force:true});}
});
