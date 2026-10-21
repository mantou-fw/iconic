import { randomUUID } from 'node:crypto';

/** One active drawing, correlated replies and sequential browser delivery. */
export function createCanvasBroker({ commandTimeout = 10000, pollTimeout = 15000, leaseTimeout = 30000 } = {}) {
  let canvas = null;
  let lastSeen = 0;
  let waiter = null;
  const pending = new Map();
  const queue = [];
  const error = (message, status) => Object.assign(new Error(message), { status });
  const next = () => {
    while (queue.length) {
      const request = queue.shift();
      if (pending.has(request.id)) return request;
    }
    return null;
  };
  function claim(id) {
    if (canvas && canvas !== id && Date.now() - lastSeen < leaseTimeout) throw error('Another canvas is connected. Close it before connecting this drawing.', 409);
    if (canvas && canvas !== id) {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error('The active canvas disconnected. Retry on the current drawing.', 503)); }
      pending.clear(); queue.length = 0;
      waiter?.finish(null);
    }
    canvas = id; lastSeen = Date.now();
  }
  return {
    async poll(id, signal) {
      if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw error('Invalid canvas id', 400);
      claim(id);
      if (signal?.aborted) return null;
      const request = next();
      if (request) return request;
      waiter?.finish(null);
      return new Promise(resolve => {
        const current = { finish: value => {
          clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (waiter === current) waiter = null;
          resolve(value);
        } };
        const abort = () => current.finish(null);
        const timer = setTimeout(() => current.finish(null), pollTimeout);
        waiter = current;
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    command(command) {
      if (!canvas || Date.now() - lastSeen >= leaseTimeout) return Promise.reject(error('No canvas is connected. Open iconic or the web editor first.', 503));
      if (pending.size >= 64) return Promise.reject(error('Canvas request queue is full. Retry shortly.', 429));
      return new Promise((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => { pending.delete(id); reject(error('The canvas did not respond. Reopen the app and retry.', 504)); }, commandTimeout);
        pending.set(id, { resolve, reject, timer });
        const request = { id, command };
        if (waiter) waiter.finish(request); else queue.push(request);
      });
    },
    reply(canvasId, id, reply) {
      if (canvas !== canvasId) throw error('Reply belongs to another canvas', 409);
      const request = pending.get(id);
      if (!request) throw error('Request expired or was already answered', 410);
      if (!reply || !['ack','error','state'].includes(reply.type)) throw error('Invalid canvas reply', 400);
      clearTimeout(request.timer); pending.delete(id); lastSeen = Date.now();
      request.resolve(reply);
    },
    close() {
      waiter?.finish(null);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error('Canvas bridge stopped', 503)); }
      pending.clear(); queue.length = 0; canvas = null; lastSeen = 0;
    },
  };
}

// Keep a single broker across server-route module reloads in development.
const key = Symbol.for('iconic.canvas-broker.v1');
export const canvasBroker = globalThis[key] ??= createCanvasBroker();
