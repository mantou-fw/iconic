/**
 * Lays out the Living Room zone in 3D over the AI bridge, tying each AV device
 * back to its tag on the schematic.
 *
 *   bun scripts/room-demo.ts
 *
 * Coordinates are metres from the room's near-left floor corner:
 * x → right, y → up, z → back. The TV wall is at z = 0.
 */
const URL_ = process.env.AV_WS ?? "ws://localhost:3000/ws?role=ai";
const socket = new WebSocket(URL_);

const send = (cmd: unknown) => socket.send(JSON.stringify(cmd));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const W = 6.4;
const D = 5.2;

socket.addEventListener("open", async () => {
  console.log(`connected to ${URL_}`);

  send({
    type: "set_room",
    name: "Living Room",
    width: W,
    depth: D,
    height: 2.7,
    clearItems: true,
  });
  await wait(200);

  const items = [
    // --- Display wall (z = 0) ------------------------------------------
    { kind: "tv", label: "85\" Display", position: { x: W / 2, y: 1.25, z: 0.06 },
      size: { w: 1.9, h: 1.08, d: 0.07 }, note: "Wall mounted, centre of display wall" },
    { kind: "cabinet", label: "Media Credenza", position: { x: W / 2, y: 0.25, z: 0.35 },
      size: { w: 2.0, h: 0.5, d: 0.45 } },

    // --- AV devices, tagged back to the schematic -----------------------
    { kind: "speaker", label: "Left Speaker", tag: "SPK-01",
      position: { x: W / 2 - 1.45, y: 1.9, z: 0.14 }, note: "AD-S52, wall bracket, toed in" },
    { kind: "speaker", label: "Right Speaker", tag: "SPK-01",
      position: { x: W / 2 + 1.45, y: 1.9, z: 0.14 }, note: "AD-S52, wall bracket, toed in" },
    { kind: "subwoofer", label: "Subwoofer", position: { x: 0.55, y: 0.21, z: 0.6 } },
    { kind: "rack", label: "AV Rack", tag: "AMP-01",
      position: { x: W - 0.55, y: 0.7, z: D - 0.6 },
      note: "CX-Q amplifier and Core 110f head end" },
    { kind: "keypad", label: "Wall Keypad", tag: "TSC-01",
      position: { x: W - 0.12, y: 1.1, z: D - 1.4 }, rotation: 90,
      note: "TSC-3, beside the entry door" },

    // --- Ceiling (shows on the reflected ceiling plan) -------------------
    { kind: "speaker", label: "Ceiling Spk 1", tag: "SPK-01", mount: "ceiling",
      position: { x: 1.9, z: 1.7 }, size: { w: 0.24, h: 0.14, d: 0.24 },
      note: "AD-C6T flush ceiling, 600mm tile centre" },
    { kind: "speaker", label: "Ceiling Spk 2", tag: "SPK-01", mount: "ceiling",
      position: { x: 4.5, z: 1.7 }, size: { w: 0.24, h: 0.14, d: 0.24 },
      note: "AD-C6T flush ceiling, 600mm tile centre" },
    { kind: "speaker", label: "Ceiling Spk 3", tag: "SPK-01", mount: "ceiling",
      position: { x: 1.9, z: 3.9 }, size: { w: 0.24, h: 0.14, d: 0.24 },
      note: "AD-C6T flush ceiling, 600mm tile centre" },
    { kind: "speaker", label: "Ceiling Spk 4", tag: "SPK-01", mount: "ceiling",
      position: { x: 4.5, z: 3.9 }, size: { w: 0.24, h: 0.14, d: 0.24 },
      note: "AD-C6T flush ceiling, 600mm tile centre" },
    { kind: "projector", label: "Projector", mount: "ceiling",
      position: { x: W / 2, z: 3.1 },
      note: "Ceiling pole mount, 3.1m from display wall" },

    // --- Furniture ------------------------------------------------------
    { kind: "rug", label: "Area Rug", position: { x: W / 2, y: 0.01, z: 2.5 },
      size: { w: 3.2, h: 0.02, d: 2.2 } },
    { kind: "sofa", label: "Sofa", position: { x: W / 2, y: 0.4, z: 3.5 },
      size: { w: 2.4, h: 0.8, d: 0.95 }, rotation: 180 },
    { kind: "table", label: "Coffee Table", position: { x: W / 2, y: 0.22, z: 2.35 },
      size: { w: 1.2, h: 0.42, d: 0.6 } },
    { kind: "chair", label: "Armchair", position: { x: 1.0, y: 0.45, z: 2.6 }, rotation: 65 },
    { kind: "plant", label: "Planter", position: { x: W - 0.6, y: 0.55, z: 1.1 } },
    { kind: "door", label: "Entry Door", position: { x: W - 0.05, y: 1.02, z: D - 0.9 },
      rotation: 90 },
    { kind: "window", label: "Window", position: { x: 0.04, y: 1.45, z: 2.8 },
      rotation: 90, size: { w: 1.8, h: 1.2, d: 0.06 } },
  ];

  for (const item of items) send({ type: "add_room_item", ...item });

  await wait(600);
  send({ type: "get_room" });
});

let errors = 0;
socket.addEventListener("message", (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.type === "state") {
    const { room, items } = msg.devices[0] ?? {};
    console.log(`\nroom: ${room?.name}  ${room?.width}×${room?.depth}×${room?.height} m`);
    console.log(`items (${items?.length ?? 0}):`);
    for (const i of items ?? []) {
      const tag = i.tag ? ` [${i.tag}]` : "";
      console.log(
        `  ${i.label}${tag} — ${i.mount} @ ${i.position.x.toFixed(2)}, ${i.position.y.toFixed(2)}, ${i.position.z.toFixed(2)}`,
      );
    }
    console.log(errors ? `\n${errors} failed` : "\nroom built clean");
    socket.close();
  } else if (msg.type === "error") {
    errors += 1;
    console.error(`✗ ${msg.command}: ${msg.message}`);
  }
});

socket.addEventListener("close", () => process.exit(errors ? 1 : 0));
socket.addEventListener("error", () => {
  console.error("socket error — is `bun --hot src/index.ts` running with the page open?");
  process.exit(1);
});
