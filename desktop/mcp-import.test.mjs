import { afterEach, expect, test, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerImportTools } from '../mcp/import-tools.mjs';

const clients = [];
afterEach(async () => { await Promise.all(clients.splice(0).map(client => client.close())); });
const provenance = { sources: [{ label: 'datasheet.pdf p.2', excerpt: 'Two analogue inputs.' }], confidence: 'high', assumptions: [] };
const product = { tag: 'DSP-01', name: 'DSP', manufacturer: 'Example', model: 'EX-1', inputs: [{ label: 'In 1', connector: 'XLR-F', signal: 'audio' }, { label: 'In 2', connector: 'XLR-F', signal: 'audio' }], outputs: [], provenance };
async function connect(call) {
  const server = new McpServer({ name: 'import-test', version: '1' });
  registerImportTools(server, call);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  clients.push(client);
  await server.connect(a);
  await client.connect(b);
  return client;
}

test('MCP extracts schema inputs, reads state first and preserves evidence in the command', async () => {
  const call = vi.fn(async command => ({ ok: true, detail: command }));
  const client = await connect(call);
  const reply = await client.callTool({ name: 'import_product', arguments: product });
  expect(reply.isError).not.toBe(true);
  expect(call.mock.calls.map(([command]) => command.type)).toEqual(['get_state', 'import_product']);
  expect(call.mock.calls[1][0]).toEqual({ type: 'import_product', ...product });
  call.mockClear();
  const invalid = await client.callTool({ name: 'import_product', arguments: { ...product, provenance: undefined } });
  expect(invalid.isError).toBe(true);
  expect(call).not.toHaveBeenCalled();
});

test('MCP reads both states and sends one room command with safe defaults', async () => {
  const call = vi.fn(async () => ({ ok: true }));
  const client = await connect(call);
  const reply = await client.callTool({ name: 'import_room_layout', arguments: {
    importId: 'photo-1', room: { name: 'Room', width: 6, height: 3, depth: 5 },
    dimensionBasis: 'estimated', provenance: { ...provenance, assumptions: ['Scale estimated from a door'] },
    items: [{ kind: 'desk', label: 'Desk', position: { x: 3, y: 0.4, z: 2 }, size: { w: 2, h: 0.8, d: 1 }, mount: 'floor' }],
  } });
  expect(reply.isError).not.toBe(true);
  expect(call.mock.calls.map(([command]) => command.type)).toEqual(['get_state', 'get_room', 'import_room_layout']);
  expect(call.mock.calls[2][0]).toMatchObject({ mode: 'append', items: [{ rotation: 0 }] });
});

test('read failure prevents import and is reported as an MCP error', async () => {
  const call = vi.fn(async () => { throw new Error('No canvas connected'); });
  const client = await connect(call);
  const reply = await client.callTool({ name: 'import_product', arguments: product });
  expect(reply.isError).toBe(true);
  expect(call).toHaveBeenCalledTimes(1);
  expect(reply.content[0].text).toContain('No canvas connected');
});

test('real stdio server advertises 17 tools, non-destructive room defaults, sizes and both prompts', async () => {
  const client = new Client({ name: 'test', version: '1' });
  clients.push(client);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))] }));
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(17);
  const room = tools.find(tool => tool.name === 'build_room');
  expect(room.inputSchema.properties.clearFirst.default).toBe(false);
  expect(room.inputSchema.properties.items.items.properties.size).toBeDefined();
  expect((await client.listPrompts()).prompts.map(prompt => prompt.name)).toEqual(['product_from_datasheet', 'room_from_image']);
  const prompt = await client.getPrompt({ name: 'room_from_image', arguments: { image: 'photo.jpg' } });
  expect(prompt.messages[0].content.text).toContain('Never claim a photo provides exact measurements');
});

test('connection checker forwards a custom canvas URL into its MCP child', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ type: 'state', devices: [], cables: [] }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/mcp-check.mjs', import.meta.url))], {
      env: { ...process.env, AV_CANVAS_URL: `http://127.0.0.1:${server.address().port}` }, timeout: 10000,
    });
    expect(stdout).toContain('Connected: 0 devices, 0 cables');
    expect(requests).toEqual([{ action: 'command', command: { type: 'get_state' } }]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
