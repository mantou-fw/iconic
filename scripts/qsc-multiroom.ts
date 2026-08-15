/**
 * Draws a 4-zone QSC Core 110f multi-room audio system on the canvas over the
 * realtime AI bridge (see src/lib/ai-bridge.ts for the command contract).
 *
 *   bun scripts/qsc-multiroom.ts
 *
 * System: two sources (BGM streamer + paging mic) feed the Core 110f DSP,
 * which distributes four independent zones over Phoenix-terminated analog
 * outs to per-zone amplifiers and speakers, and exposes Dante over a network
 * switch that also carries control traffic out to a TSC-3 keypad per zone.
 */
const URL_ = process.env.AV_WS ?? "ws://localhost:3000/ws?role=ai";
const socket = new WebSocket(URL_);

const send = (cmd: unknown) => socket.send(JSON.stringify(cmd));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Zone = { n: number; name: string };

const ZONE_TINTS = ["#16a34a", "#9333ea", "#ea580c", "#0891b2"];

const zones: Zone[] = [
  { n: 1, name: "Living Room" },
  { n: 2, name: "Kitchen" },
  { n: 3, name: "Patio" },
  { n: 4, name: "Bedroom" },
];

socket.addEventListener("open", async () => {
  console.log(`connected to ${URL_}`);
  send({ type: "clear" });
  await wait(150);

  // ---- Zones (created first so devices can be dropped into them) ---------
  send({ type: "add_zone", name: "Head End", color: "#0071e3", position: { x: 20, y: 20 }, width: 900, height: 460 });
  zones.forEach((z, i) => {
    send({
      type: "add_zone",
      name: z.name,
      color: ZONE_TINTS[i % ZONE_TINTS.length],
      position: { x: 980, y: 20 + i * 300 },
      width: 760,
      height: 250,
    });
  });
  await wait(250);

  // ---- Sources -----------------------------------------------------------
  send({
    type: "add_device",
    tag: "SRC-01",
    name: "BGM Streamer",
    manufacturer: "Sonos",
    model: "Port",
    outputs: [{ label: "L/R Out", connector: "RCA", signal: "audio" }],
    zone: "Head End",
    position: { x: 40, y: 60 },
  });
  send({
    type: "add_device",
    tag: "SRC-02",
    name: "Paging Station",
    manufacturer: "Shure",
    model: "631A",
    outputs: [{ label: "Mic Out", connector: "XLR-M", signal: "audio" }],
    zone: "Head End",
    position: { x: 40, y: 300 },
  });

  // ---- Core DSP -----------------------------------------------------------
  send({
    type: "add_device",
    tag: "DSP-01",
    name: "Audio DSP",
    manufacturer: "QSC",
    model: "Core 110f",
    inputs: [
      { label: "BGM In", connector: "PHOENIX", signal: "audio" },
      { label: "Page Mic In", connector: "PHOENIX", signal: "audio" },
      { label: "Dante In", connector: "RJ45", signal: "network" },
    ],
    outputs: [
      ...zones.map((z) => ({
        label: `Zone ${z.n} - ${z.name}`,
        connector: "PHOENIX",
        signal: "audio" as const,
      })),
      { label: "Dante Out", connector: "RJ45", signal: "network" },
    ],
    zone: "Head End",
    position: { x: 420, y: 40 },
  });

  // ---- Network / control ---------------------------------------------------
  send({
    type: "add_device",
    tag: "NET-01",
    name: "Dante / Control Switch",
    manufacturer: "Cisco",
    model: "SG350-10P",
    inputs: [{ label: "DSP Link", connector: "RJ45", signal: "network" }],
    outputs: zones.map((z) => ({
      label: `Keypad ${z.n}`,
      connector: "RJ45",
      signal: "control" as const,
    })),
    zone: "Head End",
    position: { x: 420, y: 290 },
  });

  for (const z of zones) {
    send({
      type: "add_device",
      tag: `TSC-0${z.n}`,
      name: `${z.name} Keypad`,
      manufacturer: "QSC",
      model: "TSC-3",
      inputs: [{ label: "Network", connector: "RJ45", signal: "control" }],
      zone: z.name,
      position: { x: 500, y: 130 },
    });
  }

  // ---- Amps + speakers, one pair per zone ---------------------------------
  for (const z of zones) {
    send({
      type: "add_device",
      tag: `AMP-0${z.n}`,
      name: `${z.name} Amplifier`,
      manufacturer: "QSC",
      model: "CX-Q 4x1",
      inputs: [{ label: "Line In", connector: "PHOENIX", signal: "audio" }],
      outputs: [{ label: "Spk Out", connector: "SPEAKON", signal: "audio" }],
      zone: z.name,
      position: { x: 40, y: 40 },
    });
    send({
      type: "add_device",
      tag: `SPK-0${z.n}`,
      name: `${z.name} Speakers`,
      manufacturer: "QSC",
      model: "AD-S52",
      inputs: [{ label: "In", connector: "SPEAKON", signal: "audio" }],
      zone: z.name,
      position: { x: 500, y: 40 },
    });
  }

  // Give the canvas a beat to commit every node before wiring them together.
  await wait(500);

  send({ type: "connect", from: "SRC-01", fromPort: "L/R Out", to: "DSP-01", toPort: "BGM In", label: "A-100" });
  send({ type: "connect", from: "SRC-02", fromPort: "Mic Out", to: "DSP-01", toPort: "Page Mic In", label: "A-101" });
  send({ type: "connect", from: "DSP-01", fromPort: "Dante Out", to: "NET-01", toPort: "DSP Link", label: "N-100" });

  for (const z of zones) {
    send({
      type: "connect",
      from: "NET-01",
      fromPort: `Keypad ${z.n}`,
      to: `TSC-0${z.n}`,
      toPort: "Network",
      label: `N-10${z.n}`,
    });
    send({
      type: "connect",
      from: "DSP-01",
      fromPort: `Zone ${z.n} - ${z.name}`,
      to: `AMP-0${z.n}`,
      toPort: "Line In",
      label: `A-20${z.n}`,
    });
    send({
      type: "connect",
      from: `AMP-0${z.n}`,
      fromPort: "Spk Out",
      to: `SPK-0${z.n}`,
      toPort: "In",
      label: `SP-20${z.n}`,
    });
  }

  // Sheet identification, as on an issued AV package.
  send({
    type: "add_title_block",
    position: { x: 1800, y: 20 },
    fields: {
      company: "ACME AV INTEGRATION",
      client: "Private Residence",
      project: "Multi-Room Audio",
      projectNumber: "AV-2026-014",
      title: "MULTI-ROOM AUDIO",
      description: "Head End & Zone Distribution",
      projectManager: "—",
      drawnBy: "AV Schematic",
      scale: "NONE",
      page: "1 OF 1",
      rev: "A",
    },
  });

  await wait(600);
  send({ type: "get_state" });
});

let errors = 0;
socket.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.type === "state") {
    console.log(`\ndevices (${msg.devices.length}):`);
    for (const d of msg.devices) console.log(`  ${d.tag}  ${d.name}`);
    console.log(`cables (${msg.cables.length}):`);
    for (const c of msg.cables) {
      console.log(`  ${c.label}  ${c.from}/${c.fromPort} → ${c.to}/${c.toPort}`);
    }
    console.log(errors ? `\n${errors} command(s) failed — see above` : "\nbuilt clean, no errors");
    socket.close();
  } else if (msg.type === "error") {
    errors += 1;
    console.error(`✗ ${msg.command}: ${msg.message}`);
  }
});

socket.addEventListener("close", () => process.exit(errors ? 1 : 0));
socket.addEventListener("error", (e) => {
  console.error("socket error — is `bun --hot src/index.ts` running?", e);
  process.exit(1);
});
