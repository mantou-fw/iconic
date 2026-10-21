import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const name = `iconic-web-${version}`;
const staging = path.join(root, '.desktop', name);
await rm(staging, { recursive: true, force: true });
await cp(path.join(root, '.output'), staging, { recursive: true, dereference: true });
await writeFile(path.join(staging, 'package.json'), JSON.stringify({ name: 'iconic-web', version, private: true, type: 'module', scripts: { start: 'node server/index.mjs' }, engines: { node: '>=22.20.0' } }, null, 2) + '\n');
await writeFile(path.join(staging, 'README.md'), '# iconic web server\n\nRequires Node.js 22.20+. No npm install is needed.\n\nRun from this folder:\n\n```sh\nNITRO_HOST=127.0.0.1 NITRO_PORT=4321 npm start\n```\n\nOn PowerShell, set `$env:NITRO_HOST="127.0.0.1"` and `$env:NITRO_PORT="4321"`, then run `npm start`.\n\nOpen http://localhost:4321. Keep the server local; its MCP endpoint controls the active drawing. Use the menu to select English, 繁體中文 or 日本語, and open the AI guide for the agent pack.\n');
const files = {};
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else files[`${name}/${path.relative(staging, absolute).split(path.sep).join('/')}`] = new Uint8Array(await readFile(absolute));
  }
}
await walk(staging);
await mkdir(path.join(root, 'release/web'), { recursive: true });
const destination = path.join(root, 'release/web', `${name}.zip`);
await writeFile(destination, zipSync(files, { level: 6 }));
console.log(`Web release: ${destination}`);
