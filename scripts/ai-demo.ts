/**
 * Demo agent for the realtime canvas bridge.
 *
 *   bun scripts/ai-demo.ts            # build a small sample system
 *   bun scripts/ai-demo.ts state      # print what is on the canvas
 *   bun scripts/ai-demo.ts clear      # wipe the canvas
 *
 * Connect your own agent the same way: open ws://localhost:3000/ws?role=ai and
 * send the JSON commands defined in src/lib/ai-bridge.ts.
 */
const URL_ = process.env.AV_WS ?? "ws://localhost:3000/ws?role=ai";
const mode = process.argv[2] ?? "demo";

const socket = new WebSocket(URL_);

const send = (cmd: unknown) => socket.send(JSON.stringify(cmd));

socket.addEventListener("open", async () => {
  console.log(`connected to ${URL_}`);

  if (mode === "state") {
    send({ type: "get_state" });
    return;
  }
  if (mode === "clear") {
    send({ type: "clear" });
    setTimeout(() => socket.close(), 300);
    return;
  }

  send({ type: "clear" });
  send({
    type: "add_device",
    tag: "DSP-01",
    name: "Audio DSP",
    manufacturer: "QSC",
    model: "Core 110f",
    inputs: [
      { label: "Mic 1", connector: "XLR-F", signal: "audio" },
      { label: "Mic 2", connector: "XLR-F", signal: "audio" },
      { label: "LAN", connector: "RJ45", signal: "network" },
    ],
    outputs: [
      { label: "Zone A", connector: "PHOENIX", signal: "audio" },
      { label: "Zone B", connector: "PHOENIX", signal: "audio" },
    ],
    position: { x: 80, y: 120 },
  });
  send({
    type: "add_device",
    tag: "AMP-01",
    name: "Power Amplifier",
    manufacturer: "Crown",
    model: "CDi 2|300",
    inputs: [{ label: "In A", connector: "PHOENIX", signal: "audio" }],
    outputs: [{ label: "Spk A", connector: "SPEAKON", signal: "audio" }],
    position: { x: 520, y: 120 },
  });
  send({
    type: "add_device",
    tag: "SW-01",
    name: "Network Switch",
    manufacturer: "Cisco",
    model: "CBS350-8P",
    inputs: [{ label: "Uplink", connector: "RJ45", signal: "network" }],
    outputs: [{ label: "Port 1", connector: "RJ45", signal: "network" }],
    position: { x: 80, y: 420 },
  });

  // Give the canvas a beat to commit the nodes before wiring them together.
  await new Promise((r) => setTimeout(r, 400));
  send({
    type: "connect",
    from: "DSP-01",
    fromPort: "Zone A",
    to: "AMP-01",
    toPort: "In A",
    label: "C-101",
  });
  send({
    type: "connect",
    from: "SW-01",
    fromPort: "Port 1",
    to: "DSP-01",
    toPort: "LAN",
    label: "N-201",
  });

  await new Promise((r) => setTimeout(r, 400));
  send({ type: "get_state" });
});

socket.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.type === "state") {
    console.log(`\ndevices (${msg.devices.length}):`);
    for (const d of msg.devices) {
      console.log(`  ${d.tag}  ${d.name}  ${d.manufacturer} ${d.model}`);
    }
    console.log(`cables (${msg.cables.length}):`);
    for (const c of msg.cables) {
      console.log(`  ${c.label || "—"}  ${c.from}/${c.fromPort} → ${c.to}/${c.toPort}`);
    }
    socket.close();
  } else if (msg.type === "error") {
    console.error(`✗ ${msg.command}: ${msg.message}`);
  } else if (msg.type === "ack") {
    console.log(`✓ ${msg.command}`, msg.detail ?? "");
  }
});

socket.addEventListener("close", () => process.exit(0));
socket.addEventListener("error", (e) => {
  console.error("socket error — is `bun dev` running?", e);
  process.exit(1);
});
