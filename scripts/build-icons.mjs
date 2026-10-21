// Run with Electron: npm run icons:build. SVG is the canonical artwork.
import { app, BrowserWindow } from 'electron';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
app.setPath('userData', path.join(root, '.desktop/icon-renderer'));
app.whenReady().then(async () => {
const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, nodeIntegration: false, contextIsolation: true, sandbox: true } });
try {
  await window.loadURL('about:blank');
  const svg = await readFile(path.join(root, 'public/icon.svg'), 'utf8');
  const render = async size => Buffer.from(await window.webContents.executeJavaScript(`(async () => {
    const image = new Image(); image.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = ${size}; canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
    return canvas.toDataURL('image/png').split(',')[1];
  })()`), 'base64');
  const assets = path.join(root, 'desktop/assets');
  await mkdir(assets, { recursive: true });
  await writeFile(path.join(assets, 'icon.png'), await render(1024));
  // ICO supports PNG frames, preserving alpha and crisp edges at every size.
  const frames = await Promise.all([16, 32, 48, 64, 128, 256].map(async size => ({ size, png: await render(size) })));
  const header = Buffer.alloc(6 + frames.length * 16); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, i) => { const at = 6 + i * 16; header[at] = header[at + 1] = size === 256 ? 0 : size; header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += png.length; });
  await writeFile(path.join(assets, 'icon.ico'), Buffer.concat([header, ...frames.map(f => f.png)]));
  if (process.platform === 'darwin') {
    const iconset = path.join(root, '.desktop/icon.iconset'); await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      await writeFile(path.join(iconset, `icon_${size}x${size}.png`), await render(size));
      await writeFile(path.join(iconset, `icon_${size}x${size}@2x.png`), await render(size * 2));
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'icon.icns')]);
    await rm(iconset, { recursive: true });
  }
  console.log('Generated iconic desktop icons.');
} finally { window.destroy(); app.quit(); }

}).catch(error => { console.error(error); app.exit(1); });
