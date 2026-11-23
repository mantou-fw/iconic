import { randomUUID } from 'node:crypto';
import { createExecutionRegistry } from './canvas-executions.mjs';

/**
 * One active drawing, correlated replies and sequential browser delivery.
 * @param {{ commandTimeout?: number, pollTimeout?: number, leaseTimeout?: number, retention?: number, capacity?: number }} [options]
 */
export function createCanvasBroker({ commandTimeout = 10000, pollTimeout = 15000, leaseTimeout = 30000, retention, capacity } = {}) {
  let canvas = null;
  let document = null;
  let scope = null;
  let lastSeen = 0;
  let waiter = null;
  const pending = new Map();
  const answered = new Set();
  const queue = [];
  const error = (message, status) => Object.assign(new Error(message), { status });
  const active = () => !!canvas && Date.now() - lastSeen < leaseTimeout;
  const deliver = request => {
    request.delivered = true;
    return { id: request.id, command: request.command };
  };
  const next = () => {
    while (queue.length) {
      const request = queue.shift();
      if (pending.has(request.id)) return deliver(request);
    }
    return null;
  };
  function dispatch(command, callbacks, tracked = true) {
    if (!active()) throw error('No canvas is connected. Open iconic or the web editor first.', 503);
    if (pending.size >= 64) throw error('Canvas request queue is full. Retry shortly.', 429);
    const id = randomUUID();
    const request = { id, command, ...callbacks, tracked, delivered: false };
    const cancel = () => { clearTimeout(request.timer); pending.delete(id); };
    request.timer = setTimeout(() => {
      if (!tracked || !request.delivered) cancel();
      request.timeout(request.delivered);
    }, commandTimeout);
    pending.set(id, request);
    if (waiter) waiter.finish(deliver(request)); else queue.push(request);
    return cancel;
  }
  const executions = createExecutionRegistry(dispatch, { retention, capacity });
  function reset(message) {
    waiter?.finish(null);
    executions.setScope(null);
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.disconnect?.(error(message, 503));
    }
    pending.clear(); answered.clear(); queue.length = 0;
  }
  function claim(id, documentId) {
    if (canvas !== id && active()) throw error('Another canvas is connected. Close it before connecting this drawing.', 409);
    if (canvas !== id || document !== documentId) {
      reset('The active canvas changed. Read the current drawing before retrying.');
      scope = documentId ? randomUUID() : null;
      executions.setScope(scope);
    }
    canvas = id; document = documentId; lastSeen = Date.now();
    executions.prune();
  }
  return {
    /** @param {string} id @param {AbortSignal} [signal] @param {string | null} [documentId] */
    async poll(id, signal, documentId = null) {
      if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) throw error('Invalid canvas id', 400);
      if (documentId !== null && (typeof documentId !== 'string' || !/^[\w-]{1,100}$/.test(documentId))) throw error('Invalid canvas document id', 400);
      if (signal?.aborted) return null;
      claim(id, documentId);
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
      executions.prune();
      return new Promise((resolve, reject) => {
        dispatch(command, {
          reply: resolve, disconnect: reject,
          timeout: delivered => reject(error(delivered
            ? 'The canvas did not respond after delivery. Read the drawing before retrying; the outcome is unresolved.'
            : 'The canvas did not respond before delivery. This command was not applied.', 504)),
        }, false);
      });
    },
    executionContext() {
      if (!active() || !scope) throw error('No canvas with execution tracking is connected.', 503);
      return { scope };
    },
    execute(requestedScope, id, commands) { return executions.start(requestedScope, id, commands); },
    executionStatus(requestedScope, id) { return executions.status(requestedScope, id); },
    /** @param {string} canvasId @param {string} id @param {any} reply @param {string | null} [documentId] */
    reply(canvasId, id, reply, documentId = null) {
      if (canvas !== canvasId || document !== documentId) throw error('Reply belongs to another canvas', 409);
      executions.prune();
      if (!reply || !['ack','error','state'].includes(reply.type)) throw error('Invalid canvas reply', 400);
      if (answered.has(id)) return;
      const request = pending.get(id);
      if (!request?.delivered) throw error('Request expired or was already answered', 410);
      clearTimeout(request.timer); pending.delete(id); lastSeen = Date.now();
      if (request.tracked) {
        answered.add(id);
        if (answered.size > 256) answered.delete(answered.values().next().value);
      }
      request.reply(reply);
    },
    close() {
      reset('Canvas bridge stopped');
      canvas = null; document = null; scope = null; lastSeen = 0;
    },
  };
}

// Keep a single broker across server-route module reloads in development.
const key = Symbol.for('iconic.canvas-broker.v2');
export const canvasBroker = globalThis[key] ??= createCanvasBroker();
