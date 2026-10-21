import { app, BrowserWindow, dialog, Menu, session, shell } from "electron";
import { mkdirSync } from "node:fs";
import { migrateProfile } from "./profile.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "./server.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4321);
const development = !app.isPackaged;
app.setName(development ? "iconic Dev" : "iconic");
const userData = path.join(app.getPath("appData"), development ? `iconic Electron Dev${process.env.ICONIC_TEST_PROFILE ? " " + process.env.ICONIC_TEST_PROFILE : ""}` : "iconic Electron");
migrateProfile(app.getPath("appData"), userData, development, process.env.ICONIC_TEST_PROFILE);
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);

let window;
let backend;
let starting;
const startupAbort = new AbortController();
let quitting = false;
let readyToQuit = false;

function external(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") void shell.openExternal(url.href);
  } catch { /* Ignore malformed links. */ }
}

function createWindow() {
  window = new BrowserWindow({
    title: "iconic",
    width: 1280, height: 840, minWidth: 800, minHeight: 600,
    icon: path.join(directory, "assets/icon.png"),
    show: false, backgroundColor: "#1c1c1e",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false },
  });
  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => { window = undefined; });
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: "deny" }; });
  window.webContents.on("will-navigate", (event, raw) => {
    if (new URL(raw).origin !== backend.url) { event.preventDefault(); external(raw); }
  });
  window.webContents.on("render-process-gone", (_, details) => {
    if (!quitting) dialog.showErrorBox("iconic", `The canvas stopped (${details.reason}). Reopen the app to recover its saved drawing.`);
  });
  return window.loadURL(backend.url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", event => {
    if (readyToQuit) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    startupAbort.abort();
    Promise.resolve(starting).catch(() => undefined).then(server => server?.stop()).finally(() => { readyToQuit = true; app.quit(); });
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => app.quit());
  app.whenReady().then(async () => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535.");
    const executable = development ? (process.env.ICONIC_NODE_PATH ?? process.execPath) : process.execPath;
    starting = startBackend({
      executable,
      args: development ? [path.resolve(directory, "../node_modules/vite/bin/vite.js")] : [path.join(process.resourcesPath, "web/server/index.mjs")],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      cwd: development ? path.resolve(directory, "..") : process.resourcesPath,
      port,
      production: !development,
      signal: startupAbort.signal,
    });
    backend = await starting;
    if (quitting) return;
    backend.exited.then(() => {
      if (!quitting) { dialog.showErrorBox("iconic", "The canvas background server stopped. Reopen the app to recover its saved drawing."); app.quit(); }
    });
    session.defaultSession.setPermissionRequestHandler((_, __, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : [{ role: "fileMenu" }]),
      { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
    ]));
    await createWindow();
  }).catch(error => { if (!quitting) dialog.showErrorBox("iconic could not start", error.message); app.quit(); });
}
