import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
const client = new Client({ name: 'mcp-check', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))] }));
  const { tools } = await client.listTools();
  console.log(`MCP tools (${tools.length}): ${tools.map(tool => tool.name).join(', ')}`);
  const result = await client.callTool({ name: 'list_devices', arguments: {} });
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  if (result.isError) throw new Error(text);
  const state = JSON.parse(text);
  console.log(`Connected: ${state.devices.length} devices, ${state.cables.length} cables. No drawing changes.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client.close(); }
