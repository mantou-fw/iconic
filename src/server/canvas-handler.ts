import { validateActions } from '../../desktop/commands.mjs';
import { canvasBroker } from './canvas-broker.mjs';

export async function handleCanvasRequest(request: Request) {
  const url = new URL(request.url);
  // Restrict both browser origins and Host to loopback, including DNS rebinding.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || (request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Local canvas requests only' }, { status: 403 });
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return Response.json({ error: 'Expected application/json' }, { status: 415 });
  try {
    let bytes = 0;
    const reader = request.body?.getReader();
    if (!reader) throw Object.assign(new Error('Missing request body'), { status: 400 });
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024 * 1024) { await reader.cancel(); throw Object.assign(new Error('Canvas request too large'), { status: 413 }); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    let result;
    switch (body.action) {
      case 'poll': result = await canvasBroker.poll(body.canvasId, request.signal); break;
      case 'command':
        try { validateActions([body.command]); } catch (error) { throw Object.assign(error as Error, { status: 400 }); }
        result = await canvasBroker.command(body.command); break;
      case 'reply': canvasBroker.reply(body.canvasId, body.id, body.reply); result = { ok: true }; break;
      default: throw Object.assign(new Error('Unknown canvas action'), { status: 400 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: error instanceof SyntaxError ? 400 : (error as { status?: number }).status ?? 500 });
  }
}
