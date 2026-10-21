import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { build, Platform, Arch } from 'electron-builder';
import { configuration } from '../desktop/builder.mjs';
import { buildAgentPack } from './build-agent-pack.mjs';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const run = (executable, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { stdio: 'inherit', ...options });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${executable} exited with ${code}`)));
});
const [command = 'dev', ...flags] = process.argv.slice(2);
if (command === 'dev') {
  await buildAgentPack();
  const child = spawn(require('electron'), ['desktop'], { stdio: 'inherit', env: { ...process.env, ICONIC_NODE_PATH: process.execPath } });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.once('error', error => { console.error(error); process.exit(1); });
  child.once('exit', code => process.exit(code ?? 1));
} else if (command === 'build') {
  await buildAgentPack();
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  const option = name => flags.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const platforms = (option('platform') ?? process.platform).split(',');
  const onlyDirectory = flags.includes('--dir');
  for (const platform of platforms) {
    if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported platform: ${platform}`);
    for (const arch of (option('arch') ?? (platform === process.platform ? process.arch : 'x64')).split(',')) {
      if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported architecture: ${arch}`);
      let appOutDir = '';
      const config = configuration({ platform, arch, version: pkg.version, afterPack: async context => { appOutDir = context.appOutDir; } });
      const target = platform === 'darwin' ? Platform.MAC : Platform.WINDOWS;
      await build({ targets: target.createTarget(platform === 'darwin' || onlyDirectory ? 'dir' : 'nsis', Arch[arch]), config });
      if (platform !== 'darwin' || onlyDirectory) continue;
      if (process.platform !== 'darwin') throw new Error('Create macOS disk images on a Mac.');
      const output = path.resolve(config.directories.output);
      await mkdir(output, { recursive: true });
      const staging = await mkdtemp(path.join(tmpdir(), 'iconic-electron-dmg-'));
      try {
        await run('ditto', [path.join(appOutDir, 'iconic.app'), path.join(staging, 'iconic.app')]);
        await symlink('/Applications', path.join(staging, 'Applications'));
        const dmg = path.join(output, `iconic-${pkg.version}-${arch}.dmg`);
        await run('hdiutil', ['create', '-ov', '-volname', 'iconic', '-srcfolder', staging, '-format', 'UDZO', dmg]);
        console.log(`DMG: ${dmg}`);
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
  }
} else throw new Error('Use desktop.mjs dev or build');
