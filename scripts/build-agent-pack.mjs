import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildAgentPack() {
  const pkg = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  const output = path.join(root,'.desktop','agent-pack','iconic-agent-pack');
  await rm(output,{recursive:true,force:true});
  await mkdir(path.join(output,'scripts'),{recursive:true});
  await mkdir(path.join(output,'mcp'),{recursive:true});
  const bundle = async (entry,outfile) => build({
    entryPoints:[path.join(root,entry)],outfile:path.join(output,outfile),bundle:true,platform:'node',target:'node22.20',format:'esm',minify:true,
    banner:{js:'import { createRequire as __iconicCreateRequire } from "node:module"; const require = __iconicCreateRequire(import.meta.url);'},legalComments:'eof',
  });
  await Promise.all([
    bundle('mcp/server.mjs','mcp/server.mjs'),
    bundle('scripts/mcp-check.mjs','scripts/mcp-check.mjs'),
    cp(path.join(root,'scripts/setup-agent.mjs'),path.join(output,'scripts/setup-agent.mjs')),
    cp(path.join(root,'.agents/skills/av-schematic'),path.join(output,'skills/av-schematic'),{recursive:true}),
  ]);
  await writeFile(path.join(output,'package.json'),JSON.stringify({name:'iconic-agent-pack',version:pkg.version,private:true,type:'module',engines:{node:'>=22.20.0'},scripts:{setup:'node scripts/setup-agent.mjs',check:'node scripts/mcp-check.mjs',serve:'node mcp/server.mjs'}},null,2)+'\n');
  await writeFile(path.join(output,'README.md'),`# iconic agent pack\n\nRequires Node.js 22.20+ and npm. MCP dependencies are bundled; no npm install is needed. Extract this folder to a permanent location and keep iconic open.\n\nFrom this folder:\n\n\`\`\`sh\n# Preview without changing settings\nnode scripts/setup-agent.mjs --agent codex --with-skill --dry-run\n\n# Choose your client (these commands change its user-level MCP settings)\nnode scripts/setup-agent.mjs --agent codex --with-skill\nnode scripts/setup-agent.mjs --agent claude-code --with-skill\n\n# Generic MCP JSON, without writing settings\nnode scripts/setup-agent.mjs --agent generic\n\n# Install only the skill, using Vercel skills\nnpx skills add . --skill av-schematic -a codex -a claude-code -g --copy\n\`\`\`\n\nUse --url http://localhost:8080 for a different app port. Existing registrations pointing elsewhere are preserved unless --replace is supplied. After setup, reload your AI client. The read-only connection check reads devices and cables without editing. Exit code 2 means registration is saved but the app connection is not verified.\n\n--with-skill uses the Vercel skills CLI and needs internet access. Installing the skill alone does not register MCP. Other agents can use the generic JSON and their own skill target.\n\nDo not move or delete this folder after registering: MCP uses its absolute path. The pack does not install or start the desktop app. Bundled SDK dependency license notices are preserved in the JavaScript files.\n`);
  const files = {};
  const walk = async directory => {
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      const absolute = path.join(directory,entry.name);
      if(entry.isDirectory())await walk(absolute);
      else files[`iconic-agent-pack/${path.relative(output,absolute).split(path.sep).join('/')}`]=new Uint8Array(await readFile(absolute));
    }
  };
  await walk(output);
  const archive = zipSync(files,{level:6});
  const downloads = path.join(root,'public','downloads');
  const releases = path.join(root,'release','agent-pack');
  await Promise.all([mkdir(downloads,{recursive:true}),mkdir(releases,{recursive:true})]);
  const release = path.join(releases,`iconic-agent-pack-${pkg.version}.zip`);
  await Promise.all([writeFile(path.join(downloads,'iconic-agent-pack.zip'),archive),writeFile(release,archive)]);
  console.log(`Agent pack: ${release} (${(archive.byteLength/1024).toFixed(0)} KiB)`);
  return { directory:output,archive:release };
}
if(process.argv[1]&&pathToFileURL(await realpath(process.argv[1])).href===import.meta.url)await buildAgentPack();
