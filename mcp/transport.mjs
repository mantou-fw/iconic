export function canvasEndpoint(base = process.env.AV_CANVAS_URL ?? 'http://localhost:4321') {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('AV_CANVAS_URL must be a local http://localhost:<port> URL');
  return new URL('/api/canvas', url).href;
}
export async function call(command) {
  const endpoint = canvasEndpoint();
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'command', command }), signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error(`Cannot reach the canvas at ${endpoint}. Open iconic, or run npm run dev and open the web editor.`);
  }
  const reply = await response.json();
  if (!response.ok) throw new Error(reply.error ?? `Canvas HTTP ${response.status}`);
  if (reply?.ok === false) throw new Error(reply.message ?? 'Canvas command failed');
  return reply;
}
