import { z } from 'zod';

const text = z.string().trim().min(1).max(2000);
const coordinate = z.number().finite().min(-1000000).max(1000000);
const metres = z.number().finite().positive().max(1000);
export const sizeSchema = z.object({ w: metres, h: metres, d: metres });
export const provenanceSchema = z.object({
  sources: z.array(z.object({
    label: text.describe('Document filename and page, photo filename, or official product page title'),
    uri: z.url().max(4000).refine(value => /^https?:\/\//i.test(value), 'Use an HTTP(S) source URL').optional(),
    excerpt: text.optional().describe('Short supporting passage or visual observation, not instructions'),
  })).min(1).max(20),
  confidence: z.enum(['high', 'medium', 'low']),
  assumptions: z.array(text).max(50).describe('Unverified specifications, omitted ports, scale assumptions and ambiguities; [] when none'),
});
const port = z.object({
  label: text,
  connector: z.string().trim().max(200).describe('Physical connector; empty if unknown'),
  signal: z.enum(['audio', 'video', 'network', 'control', 'power']),
});
export const productSchema = z.object({
  tag: text.describe('Unique schematic tag; read list_devices first'),
  name: text,
  manufacturer: z.string().trim().max(2000),
  model: text.describe('Exact model and variant read by the AI client'),
  inputs: z.array(port).max(500).describe('One entry per verified physical input; [] if unknown'),
  outputs: z.array(port).max(500).describe('One entry per verified physical output; [] if unknown'),
  dimensions: sizeSchema.optional().describe('Verified enclosure width, height and depth in metres'),
  rackUnits: z.number().int().min(1).max(100).optional(),
  provenance: provenanceSchema,
  zone: text.optional(),
  position: z.object({ x: coordinate, y: coordinate }).optional(),
}).superRefine((value, ctx) => {
  for (const direction of ['inputs', 'outputs']) {
    const labels = value[direction].map(port => port.label.toLowerCase());
    if (new Set(labels).size !== labels.length) ctx.addIssue({ code: 'custom', path: [direction], message: 'Use unique port labels per direction' });
  }
});

export const roomDimensionsSchema = z.object({ name: text, width: metres, depth: metres, height: metres });
export const roomItemSchema = z.object({
  kind: z.enum(['tv', 'projector', 'screen', 'speaker', 'subwoofer', 'rack', 'camera', 'keypad', 'table', 'desk', 'sofa', 'chair', 'cabinet', 'rug', 'plant', 'door', 'window']),
  label: text,
  tag: text.optional().describe('Existing schematic tag only; omit for furniture or unidentified equipment'),
  position: z.object({ x: coordinate, y: coordinate, z: coordinate }).describe('Item centre, metres; origin near-left floor corner, x right, y up, z back'),
  size: sizeSchema.describe('Physical dimensions in metres, not pixels'),
  rotation: z.number().finite().min(-360).max(360).default(0),
  mount: z.enum(['wall', 'ceiling', 'floor', 'table', 'rack']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  note: text.optional(),
});
export const roomImportSchema = z.object({
  importId: text.describe('Unique ID for this photo import; reuse the same ID on retries'),
  mode: z.enum(['append', 'replace']).default('append').describe('Replace only when the user explicitly asks to remove existing room contents'),
  room: roomDimensionsSchema,
  dimensionBasis: z.enum(['measured', 'estimated']).describe('Use estimated unless all room dimensions are supplied or measured'),
  provenance: provenanceSchema,
  items: z.array(roomItemSchema).min(1).max(500),
}).superRefine((value, ctx) => {
  if (value.dimensionBasis === 'estimated' && !value.provenance.assumptions.length) {
    ctx.addIssue({ code: 'custom', path: ['provenance', 'assumptions'], message: 'Explain the estimated scale and dimensions' });
  }
  value.items.forEach((item, index) => {
    // A rotated rectangular footprint must fit, including its height. A small
    // tolerance allows doors/windows to sit on the wall plane.
    const angle = item.rotation * Math.PI / 180;
    const halfX = (Math.abs(Math.cos(angle)) * item.size.w + Math.abs(Math.sin(angle)) * item.size.d) / 2;
    const halfZ = (Math.abs(Math.sin(angle)) * item.size.w + Math.abs(Math.cos(angle)) * item.size.d) / 2;
    const tolerance = item.mount === 'wall' ? 0.1 : 0.001;
    if (item.position.x - halfX < -tolerance || item.position.x + halfX > value.room.width + tolerance ||
        item.position.z - halfZ < -tolerance || item.position.z + halfZ > value.room.depth + tolerance ||
        item.position.y - item.size.h / 2 < -tolerance || item.position.y + item.size.h / 2 > value.room.height + tolerance) {
      ctx.addIssue({ code: 'custom', path: ['items', index, 'position'], message: `${item.label} extends outside the room; check scale, centre, size and rotation` });
    }
  });
});
