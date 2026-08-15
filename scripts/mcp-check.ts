/**
 * Smoke-tests the MCP server: starts it over stdio, lists its tools, and runs
 * a read-only call against the live canvas.
 *
 *   bun scripts/mcp-check.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "bun",
  // decodeURIComponent: the repo path contains non-ASCII characters, which
  // URL.pathname percent-encodes.
  args: [decodeURIComponent(new URL("../mcp/server.ts", import.meta.url).pathname)],
});

const client = new Client({ name: "mcp-check", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}):`);
for (const t of tools) console.log(`  ${t.name} — ${t.title ?? ""}`);

console.log("\ncalling list_devices …");
const result = await client.callTool({ name: "list_devices", arguments: {} });
const body = (result.content as { type: string; text?: string }[])
  .map((c) => c.text ?? "")
  .join("");
if (result.isError) {
  console.error(`✗ ${body}`);
} else {
  const state = JSON.parse(body);
  console.log(`✓ ${state.devices.length} devices, ${state.cables.length} cables`);
  for (const d of state.devices.slice(0, 5)) console.log(`    ${d.tag} ${d.name}`);
}

await client.close();
process.exit(result.isError ? 1 : 0);
