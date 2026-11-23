import { afterEach, expect, test, vi } from 'vitest';
import { createCanvasBroker, canvasBroker } from './canvas-broker.mjs';
import { handleCanvasRequest } from './canvas-handler';
afterEach(() => { vi.useRealTimers(); canvasBroker.close(); });

test('correlates concurrent calls and delivers each command once', async () => {
  const broker = createCanvasBroker();
  try {
    const polling = broker.poll('canvas-a');
    const first = broker.command({ type: 'get_state' });
    const second = broker.command({ type: 'layout' });
    const a = await polling;
    const b = await broker.poll('canvas-a');
    expect(a!.id).not.toBe(b!.id);
    broker.reply('canvas-a', b!.id, { type: 'ack', command: 'layout', ok: true });
    broker.reply('canvas-a', a!.id, { type: 'state', devices: [{ tag: 'DSP-01' }], cables: [] });
    expect(await first).toMatchObject({ type: 'state', devices: [{ tag: 'DSP-01' }] });
    expect(await second).toMatchObject({ command: 'layout' });
    expect(() => broker.reply('canvas-a', a!.id, { type: 'state' })).toThrow('expired');
  } finally { broker.close(); }
});

test('refuses a second drawing and never delivers expired queued mutations', async () => {
  vi.useFakeTimers();
  const broker = createCanvasBroker({ commandTimeout: 20, pollTimeout: 5 });
  try {
    const lease = broker.poll('canvas-a'); await vi.advanceTimersByTimeAsync(5); await lease;
    await expect(broker.poll('canvas-b')).rejects.toThrow('Another canvas');
    const pending = broker.command({ type: 'clear' });
    const failed = expect(pending).rejects.toThrow('did not respond');
    await vi.advanceTimersByTimeAsync(25); await failed;
    const poll = broker.poll('canvas-a'); await vi.advanceTimersByTimeAsync(5);
    expect(await poll).toBe(null);
  } finally { broker.close(); }
});

test('reports no drawing instead of accepting disconnected changes', async () => {
  const broker = createCanvasBroker();
  await expect(broker.command({ type: 'add_device' })).rejects.toThrow('No canvas');
  broker.close();
});

test('recovers a late reply, refuses changed content and resumes the remaining batch without reapplying a step', async () => {
  vi.useFakeTimers();
  const broker = createCanvasBroker({ commandTimeout: 20, pollTimeout: 5 });
  const commands = [{ type: 'add_text', text: 'First' }, { type: 'add_text', text: 'Second' }];
  const id = `${Date.now()}-late-batch`;
  const context = new AbortController();
  try {
    const poll = broker.poll('canvas-a', context.signal, 'project-session-a');
    const { scope } = broker.executionContext();
    expect(broker.execute(scope, id, commands)).toMatchObject({ state: 'pending', steps: [{ state: 'pending' }, { state: 'waiting' }] });
    const first = (await poll)!;
    await vi.advanceTimersByTimeAsync(21);
    expect(broker.executionStatus(scope, id)).toMatchObject({ state: 'unresolved', steps: [{ state: 'unresolved' }, { state: 'waiting' }] });
    expect(broker.execute(scope, id, [{ text: 'First', type: 'add_text' }, commands[1]!])).toMatchObject({ state: 'unresolved' });
    expect(() => broker.execute(scope, id, [{ type: 'clear' }])).toThrow('different commands');
    const nextPoll = broker.poll('canvas-a', undefined, 'project-session-a');
    await vi.advanceTimersByTimeAsync(5);
    expect(await nextPoll).toBeNull();
    const reply = { type: 'ack', command: 'add_text', ok: true };
    broker.reply('canvas-a', first.id, reply, 'project-session-a');
    broker.reply('canvas-a', first.id, reply, 'project-session-a');
    expect(broker.executionStatus(scope, id)).toMatchObject({ resumeRequired: true, steps: [{ state: 'completed' }, { state: 'waiting' }] });
    const resumed = broker.poll('canvas-a', undefined, 'project-session-a');
    expect(broker.execute(scope, id, commands)).toMatchObject({ state: 'pending', resumeRequired: false });
    const second = (await resumed)!;
    expect(second.command).toEqual(commands[1]);
    expect(second.id).not.toBe(first.id);
    broker.reply('canvas-a', second.id, reply, 'project-session-a');
    expect(broker.execute(scope, id, commands)).toMatchObject({ state: 'completed', steps: [{ state: 'completed' }, { state: 'completed' }] });
  } finally { broker.close(); }
});

test('distinguishes definite rejection, expired IDs and a changed drawing session', async () => {
  vi.useFakeTimers();
  const broker = createCanvasBroker({ commandTimeout: 20, pollTimeout: 5, retention: 100, capacity: 1 });
  const id = `${Date.now()}-retention`;
  try {
    const initial = broker.poll('canvas-a', undefined, 'project-a');
    const { scope } = broker.executionContext();
    const commands = [{ type: 'add_device', tag: 'DUPLICATE' }];
    broker.execute(scope, id, commands);
    const request = (await initial)!;
    broker.reply('canvas-a', request.id, { type: 'error', ok: false, message: 'Duplicate tag' }, 'project-a');
    expect(broker.executionStatus(scope, id)).toMatchObject({ state: 'rejected', steps: [{ reply: { message: 'Duplicate tag' } }] });
    expect(() => broker.execute(scope, `${Date.now()}-other`, commands)).toThrow('registry is full');
    await vi.advanceTimersByTimeAsync(101);
    expect(() => broker.execute(scope, id, commands)).toThrow('expired');
    const moved = broker.poll('canvas-a', undefined, 'project-b');
    expect(broker.executionContext().scope).not.toBe(scope);
    expect(() => broker.executionStatus(scope, `${Date.now()}-other`)).toThrow('scope changed');
    await vi.advanceTimersByTimeAsync(5);
    expect(await moved).toBeNull();
  } finally { broker.close(); }
});

const request = (body: unknown, headers: Record<string,string> = {}, url = 'http://localhost:4321/api/canvas') => new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('HTTP rejects cross-origin, DNS rebinding and malformed commands', async () => {
  expect((await handleCanvasRequest(request({ action: 'command', command: { type: 'clear' } }, { Origin: 'https://other.example' }))).status).toBe(403);
  expect((await handleCanvasRequest(request({}, {}, 'http://rebind.example/api/canvas'))).status).toBe(403);
  expect((await handleCanvasRequest(request({ action: 'command', command: { type: 'execute_shell' } }))).status).toBe(400);
  expect((await handleCanvasRequest(request({}, { 'Content-Type': 'text/plain' }))).status).toBe(415);
});

test('HTTP routes a real command and correlated reply through the broker', async () => {
  const poll = handleCanvasRequest(request({ action: 'poll', canvasId: 'canvas-a' }));
  // Let the streaming JSON body finish parsing before the MCP request arrives.
  await new Promise(resolve => setTimeout(resolve, 5));
  const calling = handleCanvasRequest(request({ action: 'command', command: { type: 'get_state' } }));
  const item = await (await poll).json();
  const reply = await handleCanvasRequest(request({ action: 'reply', canvasId: 'canvas-a', id: item.id, reply: { type: 'state', devices: [], cables: [] } }));
  expect(reply.ok).toBe(true);
  expect(await (await calling).json()).toEqual({ type: 'state', devices: [], cables: [] });
});
