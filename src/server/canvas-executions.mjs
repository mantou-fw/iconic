import { createHash } from 'node:crypto';

const fail = (message, status) => Object.assign(new Error(message), { status });
const operationId = /^(\d{13})-[\w-]{1,80}$/;

// A fingerprint is independent of JSON object key ordering.
function signature(value) {
  const hash = createHash('sha256');
  const visit = item => {
    if (Array.isArray(item)) {
      hash.update('[');
      for (const element of item) { visit(element); hash.update(','); }
      hash.update(']');
    } else if (item !== null && typeof item === 'object') {
      hash.update('{');
      for (const key of Object.keys(item).sort()) { hash.update(JSON.stringify(key)); hash.update(':'); visit(item[key]); hash.update(','); }
      hash.update('}');
    } else hash.update(JSON.stringify(item));
  };
  visit(value);
  return hash.digest('hex');
}

/**
 * A bounded registry of caller-selected batch IDs. Only a successful step
 * advances the batch. A late reply updates its step, and execution pauses
 * at that boundary until the caller resubmits the same batch.
 */
export function createExecutionRegistry(dispatch, { retention = 10 * 60_000, capacity = 64 } = {}) {
  const records = new Map();
  let scope = null;

  function prune(now = Date.now()) {
    for (const [id, record] of records) {
      if (record.expiresAt <= now) {
        record.cancel?.();
        records.delete(id);
      }
    }
  }

  const snapshot = record => ({
    scope, id: record.id, state: record.state, expiresAt: new Date(record.expiresAt).toISOString(),
    resumeRequired: !!record.resumeRequired,
    steps: record.steps.map((step, index) => ({ index, command: record.commands[index].type, ...step })),
  });

  const inspect = (requestedScope, id) => {
    if (!scope || requestedScope !== scope) throw fail('The active canvas execution scope changed.', 409);
    if (typeof id !== 'string') throw fail('Invalid execution ID.', 400);
    const timestamp = Number(operationId.exec(id)?.[1]);
    const now = Date.now();
    if (!Number.isFinite(timestamp) || timestamp > now + 30_000) throw fail('Invalid execution ID. Use an epoch-millisecond timestamp and a unique suffix.', 400);
    prune(now);
    if (timestamp + retention <= now) throw fail('Execution ID expired. Read the canvas before deciding on further edits.', 410);
    return { record: records.get(id), expiresAt: timestamp + retention };
  };

  function advance(record) {
    if (record.running || record.state === 'completed' || record.state === 'rejected') return;
    const index = record.steps.findIndex(step => step.state !== 'completed');
    if (index === -1) { record.state = 'completed'; return; }
    const step = record.steps[index];
    if (step.state !== 'waiting') return;
    record.state = step.state = 'pending';
    record.resumeRequired = false;
    record.running = true;
    let timedOut = false;
    const complete = reply => {
      record.running = false;
      record.cancel = undefined;
      step.state = reply.type === 'error' || reply.ok === false ? 'rejected' : 'completed';
      const bytes = Buffer.byteLength(JSON.stringify(reply));
      if (bytes + record.replyBytes <= 512 * 1024) {
        record.replyBytes += bytes;
        step.reply = reply;
      } else step.replyOmitted = true;
      if (step.state === 'rejected') { record.state = 'rejected'; return; }
      if (index === record.steps.length - 1) record.state = 'completed';
      else if (timedOut) { record.state = 'pending'; record.resumeRequired = true; }
      else advance(record);
    };
    try {
      record.cancel = dispatch(record.commands[index], {
        reply: complete,
        timeout(delivered) {
          if (delivered) {
            timedOut = true;
            record.state = step.state = 'unresolved';
          } else {
            record.running = false;
            record.cancel = undefined;
            record.state = step.state = 'rejected';
            step.message = 'The command expired in the queue before delivery.';
          }
        },
      });
    } catch (error) {
      record.running = false;
      record.state = step.state = 'rejected';
      step.message = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    setScope(next) {
      if (next === scope) return;
      for (const record of records.values()) record.cancel?.();
      records.clear();
      scope = next;
    },
    prune,
    start(requestedScope, id, commands) {
      const { record, expiresAt } = inspect(requestedScope, id);
      if (!Array.isArray(commands) || !commands.length) throw fail('At least one canvas command is required.', 400);
      if (Buffer.byteLength(JSON.stringify(commands)) > 512 * 1024) throw fail('The tracked batch is too large.', 413);
      const fingerprint = signature(commands);
      if (record) {
        if (record.fingerprint !== fingerprint) throw fail('This execution ID already belongs to different commands.', 409);
        advance(record);
        return snapshot(record);
      }
      if (records.size >= capacity) throw fail('The execution registry is full. Retry after an existing execution expires.', 429);
      const created = { id, fingerprint, expiresAt, commands, steps: commands.map(() => ({ state: 'waiting' })), state: 'pending', running: false, replyBytes: 0 };
      records.set(id, created);
      advance(created);
      return snapshot(created);
    },
    status(requestedScope, id) {
      const { record } = inspect(requestedScope, id);
      return record ? snapshot(record) : { scope, id, state: 'unresolved', steps: [] };
    },
  };
}
