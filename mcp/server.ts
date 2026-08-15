#!/usr/bin/env bun
/**
 * MCP server for the AV schematic canvas.
 *
 * Speaks MCP over stdio to the agent, and relays commands to the browser over
 * the existing WebSocket bridge (`bun --hot src/index.ts` must be running).
 * The socket stays a transport detail; the agent only ever sees typed tools.
 *
 * Register with Claude Code:
 *   claude mcp add av-schematic -- bun /path/to/mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const WS_URL = process.env.AV_WS ?? "ws://localhost:4321/ws?role=ai";
const TIMEOUT_MS = 5000;

/* ------------------------------------------------------------- transport */

let socket: WebSocket | null = null;
let connecting: Promise<WebSocket> | null = null;

/** Everything waiting on a reply from the canvas, oldest first. */
const waiters: ((msg: any) => void)[] = [];

function connect(): Promise<WebSocket> {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (connecting) return connecting;

  connecting = new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const fail = () =>
      reject(
        new Error(
          `Cannot reach the canvas at ${WS_URL}. Start it with \`bun --hot src/index.ts\` and open http://localhost:4321 in a browser.`,
        ),
      );

    ws.addEventListener("open", () => {
      socket = ws;
      connecting = null;
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      connecting = null;
      fail();
    });
    ws.addEventListener("close", () => {
      socket = null;
      connecting = null;
    });
    ws.addEventListener("message", (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      // Relay bookkeeping is not a reply to anything.
      if (msg.type === "hello" || msg.type === "peers") return;
      waiters.shift()?.(msg);
    });
  });
  return connecting;
}

/** Sends one command and waits for the canvas to answer it. */
async function call(command: Record<string, unknown>): Promise<any> {
  const ws = await connect();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(settle);
      if (i >= 0) waiters.splice(i, 1);
      reject(
        new Error(
          "The canvas did not respond. Is http://localhost:4321 open in a browser?",
        ),
      );
    }, TIMEOUT_MS);

    const settle = (msg: any) => {
      clearTimeout(timer);
      resolve(msg);
    };
    waiters.push(settle);
    ws.send(JSON.stringify(command));
  });
}

/** Fire-and-forget: the canvas only replies once, to the final command. */
async function push(command: Record<string, unknown>) {
  const ws = await connect();
  ws.send(JSON.stringify(command));
}

const text = (value: unknown) => ({
  content: [
    { type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) },
  ],
});

const failed = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

/** Normalises whatever the canvas sent back into an MCP result. */
const report = (reply: any, success: string) =>
  reply?.ok === false ? failed(reply.message ?? "Command failed") : text(success);

/* ------------------------------------------------------------------ tools */

const signal = z
  .enum(["audio", "video", "network", "control", "power"])
  .describe("Signal class; drives the cable colour on the drawing");

const port = z.object({
  label: z.string().describe('Port name, e.g. "Mic 1" or "Zone 1"'),
  connector: z.string().optional().describe('Connector type, e.g. "XLR-F", "RJ45"'),
  signal: signal.optional(),
});

const position = z
  .object({ x: z.number(), y: z.number() })
  .optional()
  .describe("Canvas position; omit to auto-place");

const server = new McpServer({ name: "av-schematic", version: "1.0.0" });

server.registerTool(
  "list_devices",
  {
    title: "List devices and cables",
    description:
      "Read the current AV schematic: every device with its ports, and every cable with its endpoints. Call this before modifying a drawing you did not create.",
    inputSchema: {},
  },
  async () => {
    const state = await call({ type: "get_state" });
    return text({ devices: state.devices ?? [], cables: state.cables ?? [] });
  },
);

server.registerTool(
  "add_zone",
  {
    title: "Add a zone",
    description:
      "Create a labelled zone container (a room or area). Devices placed in a zone move with it. Create zones before the devices that belong to them.",
    inputSchema: {
      name: z.string().describe('Zone name, e.g. "Living Room"'),
      color: z.string().optional().describe("Hex accent colour; omit to auto-pick"),
      position,
      width: z.number().optional(),
      height: z.number().optional(),
    },
  },
  async (args) => report(await call({ type: "add_zone", ...args }), `Added zone "${args.name}"`),
);

server.registerTool(
  "add_device",
  {
    title: "Add an AV device",
    description:
      "Place a device block with its input and output ports. Give each port a signal class so cables are colour-coded correctly.",
    inputSchema: {
      tag: z.string().optional().describe('Reference designator, e.g. "DSP-01"'),
      name: z.string().optional().describe('Description, e.g. "Audio DSP"'),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      inputs: z.array(port).optional(),
      outputs: z.array(port).optional(),
      zone: z.string().optional().describe("Name of an existing zone to place it in"),
      position,
    },
  },
  async (args) =>
    report(await call({ type: "add_device", ...args }), `Added ${args.tag ?? args.name ?? "device"}`),
);

server.registerTool(
  "connect_devices",
  {
    title: "Connect two devices",
    description:
      "Draw a cable from one device's output to another device's input. Ports are matched by their label; omit them to use the first available.",
    inputSchema: {
      from: z.string().describe("Source device tag or name"),
      fromPort: z.string().optional().describe("Output port label"),
      to: z.string().describe("Target device tag or name"),
      toPort: z.string().optional().describe("Input port label"),
      label: z.string().optional().describe('Cable ID, e.g. "A-101"'),
    },
  },
  async (args) =>
    report(
      await call({ type: "connect", ...args }),
      `Connected ${args.from} → ${args.to}`,
    ),
);

server.registerTool(
  "delete_device",
  {
    title: "Delete a device",
    description: "Remove a device and every cable attached to it.",
    inputSchema: { tag: z.string().describe("Device tag or name") },
  },
  async ({ tag }) => report(await call({ type: "delete_device", tag }), `Deleted ${tag}`),
);

server.registerTool(
  "add_note",
  {
    title: "Add a note",
    description: "Place a sticky memo or a plain text label on the drawing.",
    inputSchema: {
      text: z.string(),
      style: z.enum(["memo", "text"]).default("memo"),
      position,
    },
  },
  async ({ text: body, style, position: at }) =>
    report(
      await call({ type: style === "text" ? "add_text" : "add_memo", text: body, position: at }),
      "Added note",
    ),
);

server.registerTool(
  "auto_layout",
  {
    title: "Tidy the layout",
    description: "Re-flow every device into a clean grid.",
    inputSchema: {},
  },
  async () => report(await call({ type: "layout" }), "Layout tidied"),
);

server.registerTool(
  "clear_canvas",
  {
    title: "Clear the canvas",
    description:
      "Delete everything on the drawing. Destructive — confirm with the user before calling this.",
    inputSchema: {},
  },
  async () => report(await call({ type: "clear" }), "Canvas cleared"),
);

server.registerTool(
  "add_rack",
  {
    title: "Add an equipment rack",
    description:
      "Place a rack elevation on the drawing and fill it with equipment. Set `tag` on a bay to the device's schematic tag so the rack and the schematic refer to the same unit. Omit `u` to stack upward from the bottom.",
    inputSchema: {
      tag: z.string().optional().describe('Rack designator, e.g. "RK-01"'),
      name: z.string().optional(),
      units: z.number().optional().describe("Total rack units; defaults to 24"),
      equipment: z
        .array(
          z.object({
            label: z.string(),
            tag: z.string().optional().describe("Matching device tag on the schematic"),
            u: z.number().optional().describe("Lowest rack unit occupied; 1 is the bottom"),
            height: z.number().optional().describe("Height in rack units; defaults to 1"),
            color: z.string().optional(),
          }),
        )
        .optional(),
      position,
    },
  },
  async (args) =>
    report(await call({ type: "add_rack", ...args }), `Added rack ${args.tag ?? ""}`),
);

/* ------------------------------------------------------------- 3D room */

const itemKind = z.enum([
  "tv", "projector", "screen", "speaker", "subwoofer", "rack", "camera", "keypad",
  "table", "desk", "sofa", "chair", "cabinet", "rug", "plant", "door", "window",
]);

const xyz = z
  .object({ x: z.number().optional(), y: z.number().optional(), z: z.number().optional() })
  .optional()
  .describe(
    "Metres from the room's near-left floor corner: x right, y up, z back. Omit any axis for a sensible default (e.g. wall-mount height).",
  );

server.registerTool(
  "get_room",
  {
    title: "Read the 3D room",
    description:
      "Read the room's dimensions and everything placed in it. Call before rearranging a room you did not lay out.",
    inputSchema: {},
  },
  async () => text(await call({ type: "get_room" })),
);

server.registerTool(
  "set_room",
  {
    title: "Set room dimensions",
    description:
      "Name and size the room, in metres. Do this before placing items so their default positions land inside it.",
    inputSchema: {
      name: z.string().optional(),
      width: z.number().optional().describe("Left-to-right, metres"),
      depth: z.number().optional().describe("Front-to-back, metres"),
      height: z.number().optional().describe("Floor-to-ceiling, metres"),
      clearItems: z.boolean().default(false).describe("Empty the room first"),
    },
  },
  async (args) => report(await call({ type: "set_room", ...args }), "Room updated"),
);

server.registerTool(
  "add_room_item",
  {
    title: "Place a device or furniture in 3D",
    description:
      "Place one item in the room. Set `tag` to a device's schematic tag (e.g. SPK-01) to link the two, so the drawing and the physical layout stay tied together. Size and mount default sensibly per kind.",
    inputSchema: {
      kind: itemKind,
      label: z.string().describe('Human name, e.g. "Left Surround"'),
      tag: z.string().optional().describe("Matching device tag on the schematic"),
      position: xyz,
      size: z
        .object({ w: z.number().optional(), h: z.number().optional(), d: z.number().optional() })
        .optional()
        .describe("Metres; omit to use the default for this kind"),
      rotation: z.number().optional().describe("Degrees about the vertical axis"),
      mount: z.enum(["wall", "ceiling", "floor", "table", "rack"]).optional(),
      color: z.string().optional(),
      note: z.string().optional().describe("Mounting detail shown when selected"),
    },
  },
  async (args) =>
    report(await call({ type: "add_room_item", ...args }), `Placed ${args.label}`),
);

server.registerTool(
  "clear_room",
  {
    title: "Empty the 3D room",
    description: "Remove every item from the room, keeping its dimensions.",
    inputSchema: {},
  },
  async () => report(await call({ type: "clear_room" }), "Room emptied"),
);

server.registerTool(
  "build_room",
  {
    title: "Lay out a whole room at once",
    description:
      "Set the room and place all of its devices and furniture in one call. Prefer this over many add_room_item calls.",
    inputSchema: {
      name: z.string().optional(),
      width: z.number().optional(),
      depth: z.number().optional(),
      height: z.number().optional(),
      clearFirst: z.boolean().default(true),
      items: z.array(
        z.object({
          kind: itemKind,
          label: z.string(),
          tag: z.string().optional(),
          position: xyz,
          rotation: z.number().optional(),
          mount: z.enum(["wall", "ceiling", "floor", "table", "rack"]).optional(),
          color: z.string().optional(),
          note: z.string().optional(),
        }),
      ),
    },
  },
  async ({ items, clearFirst, ...room }) => {
    await push({ type: "set_room", ...room, clearItems: clearFirst });
    for (const item of items) await push({ type: "add_room_item", ...item });
    await new Promise((r) => setTimeout(r, 400));
    return text(await call({ type: "get_room" }));
  },
);

server.registerTool(
  "build_system",
  {
    title: "Build a whole system at once",
    description:
      "Create zones, devices and cables in one call. Much faster than issuing them one at a time; use this for anything beyond a couple of devices.",
    inputSchema: {
      zones: z
        .array(
          z.object({
            name: z.string(),
            color: z.string().optional(),
            position,
            width: z.number().optional(),
            height: z.number().optional(),
          }),
        )
        .optional(),
      devices: z
        .array(
          z.object({
            tag: z.string().optional(),
            name: z.string().optional(),
            manufacturer: z.string().optional(),
            model: z.string().optional(),
            inputs: z.array(port).optional(),
            outputs: z.array(port).optional(),
            zone: z.string().optional(),
            position,
          }),
        )
        .optional(),
      cables: z
        .array(
          z.object({
            from: z.string(),
            fromPort: z.string().optional(),
            to: z.string(),
            toPort: z.string().optional(),
            label: z.string().optional(),
          }),
        )
        .optional(),
      clearFirst: z.boolean().default(false).describe("Wipe the canvas first"),
    },
  },
  async ({ zones = [], devices = [], cables = [], clearFirst }) => {
    if (clearFirst) await push({ type: "clear" });
    for (const zone of zones) await push({ type: "add_zone", ...zone });
    for (const device of devices) await push({ type: "add_device", ...device });
    // Let the canvas commit its nodes before cables look ports up by name.
    await new Promise((r) => setTimeout(r, 400));
    for (const cable of cables) await push({ type: "connect", ...cable });

    await new Promise((r) => setTimeout(r, 400));
    const state = await call({ type: "get_state" });
    return text({
      built: {
        zones: zones.length,
        devices: devices.length,
        cables: cables.length,
      },
      canvas: { devices: state.devices ?? [], cables: state.cables ?? [] },
    });
  },
);

await server.connect(new StdioServerTransport());
