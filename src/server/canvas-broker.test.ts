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
