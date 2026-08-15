#!/usr/bin/env bun
/**
 * Small CLI over the canvas bridge, for shell use and scripting.
 *
 *   bun scripts/av.ts state
 *   bun scripts/av.ts clear
 *   bun scripts/av.ts layout
 *   bun scripts/av.ts zone "Living Room"
 *   bun scripts/av.ts device DSP-01 "Audio DSP" --mfr QSC --model "Core 110f" \
 *       --in "Mic 1:XLR-F:audio" --out "Zone 1:PHOENIX:audio" --zone "Living Room"
 *   bun scripts/av.ts connect DSP-01 "Zone 1" AMP-01 "Line In" --label A-201
 *   bun scripts/av.ts apply system.json      # same shape as build_system
 */
const WS_URL = process.env.AV_WS ?? "ws://localhost:3000/ws?role=ai";
const [cmd, ...rest] = process.argv.slice(2);

/** Pulls `--flag value` pairs out, leaving the positional args behind. */
function parseFlags(argv: string[]) {
  const flags: Record<string, string[]> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      (flags[key] ??= []).push(argv[++i] ?? "");
    } else positional.push(a);
  }
  return { flags, positional };
}

/** "Label:CONNECTOR:signal" → port spec. */
const toPort = (spec: string) => {
  const [label, connector, signal] = spec.split(":");
  return {
    label: label ?? "Port",
    connector: connector || "",
    signal: (signal || "audio") as string,
  };
};

const { flags, positional } = parseFlags(rest);
const one = (k: string) => flags[k]?.[0];

function build(): Record<string, unknown> | Record<string, unknown>[] {
  switch (cmd) {
    case "state":
      return { type: "get_state" };
    case "clear":
      return { type: "clear" };
    case "layout":
      return { type: "layout" };
    case "zone":
      return { type: "add_zone", name: positional[0] ?? "Zone", color: one("color") };
    case "device":
      return {
        type: "add_device",
        tag: positional[0],
        name: positional[1] ?? positional[0],
        manufacturer: one("mfr"),
        model: one("model"),
        zone: one("zone"),
        inputs: (flags.in ?? []).map(toPort),
        outputs: (flags.out ?? []).map(toPort),
      };
    case "connect":
      return {
        type: "connect",
        from: positional[0],
        fromPort: positional[1],
        to: positional[2],
        toPort: positional[3],
        label: one("label"),
      };
    case "delete":
      return { type: "delete_device", tag: positional[0] };
    default:
      console.error(
        "usage: av <state|clear|layout|zone|device|connect|delete|apply> …\n" +
          "see the header of scripts/av.ts for examples",
      );
      process.exit(2);
  }
}

const socket = new WebSocket(WS_URL);
const send = (c: unknown) => socket.send(JSON.stringify(c));

socket.addEventListener("open", async () => {
  if (cmd === "apply") {
    const file = positional[0];
    if (!file) {
      console.error("apply needs a JSON file");
      process.exit(2);
    }
    const spec = await Bun.file(file).json();
    if (spec.clearFirst) send({ type: "clear" });
    for (const z of spec.zones ?? []) send({ type: "add_zone", ...z });
    for (const d of spec.devices ?? []) send({ type: "add_device", ...d });
    await new Promise((r) => setTimeout(r, 400));
    for (const c of spec.cables ?? []) send({ type: "connect", ...c });
    await new Promise((r) => setTimeout(r, 400));
    send({ type: "get_state" });
    return;
  }
  send(build());
});

socket.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.type === "hello" || msg.type === "peers") return;
  if (msg.type === "state") {
    console.log(JSON.stringify(msg, null, 2));
  } else if (msg.type === "error") {
    console.error(`✗ ${msg.command}: ${msg.message}`);
    socket.close();
    process.exit(1);
  } else {
    console.log(`✓ ${msg.command}`, msg.detail ? JSON.stringify(msg.detail) : "");
  }
  if (cmd !== "apply" || msg.type === "state") socket.close();
});

socket.addEventListener("close", () => process.exit(0));
socket.addEventListener("error", () => {
  console.error(`cannot reach ${WS_URL} — is \`bun --hot src/index.ts\` running?`);
  process.exit(1);
});
