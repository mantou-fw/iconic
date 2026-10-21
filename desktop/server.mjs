import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// This module has no Electron imports so startup and shutdown can be tested
// against real Node.js child processes, without starting a desktop window.
export async function startBackend({ executable, args = [], cwd, port, production, timeout = 60000, signal, env = {} }) {
  const instance = randomUUID();
  const url = `http://localhost:${port}`;
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env, ...env, NODE_ENV: production ? "production" : "development", HOST: "127.0.0.1", PORT: String(port), ICONIC_INSTANCE: instance },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let finished = false;
  let failure;
  let output = "";
  const capture = chunk => {
    output = (output + chunk.toString()).slice(-4000);
    if (!production) process.stdout.write(chunk);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const exited = new Promise(resolve => {
    child.once("error", error => { failure = error; finished = true; resolve({ error }); });
    child.once("exit", (code, signal) => { finished = true; resolve({ code, signal }); });
  });
  let stopPromise;
  const stop = () => stopPromise ??= (async () => {
    if (!finished) {
      child.kill();
      await Promise.race([exited, delay(1500)]);
      if (!finished) child.kill("SIGKILL");
    }
    await exited;
  })();
  try {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("Canvas startup cancelled");
      if (finished) throw new Error(`The canvas server could not start on port ${port}. Close the other server or choose another PORT.\n${failure?.message ?? output}`);
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
        const health = await response.json();
        if (health.service === "iconic" && health.instance === instance && !finished) {
          return { url, child, stop, exited };
        }
      } catch { /* The child may still be loading its bundled frontend. */ }
      await Promise.race([delay(80), exited]);
    }
    throw new Error(`The canvas server did not become ready on port ${port}.\n${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
