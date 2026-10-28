import { describe, expect, test } from 'vitest';
import { productSchema, roomImportSchema } from '../../shared/ai-imports.mjs';
import { validateActions } from '../../desktop/commands.mjs';
import { prepareRoomImport, type RoomImport } from './ai-imports';
import { DEFAULT_ROOM, makeRoomItem } from './room';
import { parseProject } from './project';

const provenance = { sources: [{ label: 'room.jpg', excerpt: 'One table is visible in the centre.' }], confidence: 'low' as const, assumptions: ['6 × 5 × 2.7 m estimated from the doorway; no measured scale.'] };
const layout: RoomImport = {
  importId: 'room-photo-1', mode: 'append', room: { name: 'Meeting room', width: 6, depth: 5, height: 2.7 },
  dimensionBasis: 'estimated', provenance,
  items: [{ kind: 'desk', label: 'Table', position: { x: 3, y: 0.375, z: 2.5 }, size: { w: 2, h: 0.75, d: 1 }, rotation: 0, mount: 'floor' }],
};
const product = { tag: 'DSP-01', name: 'DSP', manufacturer: 'Example', model: 'EX-1', inputs: [], outputs: [], provenance };

describe('AI imports at both command boundaries', () => {
  test('model-only nodes have no fabricated ports; evidence and metric dimensions survive parsing', () => {
    expect(productSchema.parse(product).inputs).toEqual([]);
    expect(productSchema.parse({ ...product, dimensions: { w: 0.44, h: 0.044, d: 0.2 } }).dimensions?.w).toBe(0.44);
    expect(() => validateActions([{ type: 'import_product', ...product }])).not.toThrow();
    expect(() => validateActions([{ type: 'import_room_layout', ...layout }])).not.toThrow();
  });
  test('rejects missing evidence, duplicate port names, invalid signal types and unsafe source URLs', () => {
    const port = { label: 'Input 1', connector: 'XLR-F', signal: 'audio' };
    for (const invalid of [
      { ...product, provenance: undefined },
      { ...product, inputs: [port, port] },
      { ...product, outputs: [{ ...port, signal: 'invented' }] },
      { ...product, provenance: { ...provenance, sources: [{ label: 'Source', uri: 'javascript:alert(1)' }] } },
      { ...product, dimensions: { w: -1, h: 1, d: 1 } },
    ]) expect(() => validateActions([{ type: 'import_product', ...invalid }])).toThrow();
  });
  test('validates the whole room including rotated footprints before mutation', () => {
    const original = structuredClone(layout);
    const invalid = { ...layout, items: [...layout.items, { ...layout.items[0], position: { x: 0.1, y: 0.375, z: 2 }, rotation: 90 }] };
    expect(() => validateActions([{ type: 'import_room_layout', ...invalid }])).toThrow(/outside the room/);
    expect(() => roomImportSchema.parse({ ...layout, provenance: { ...provenance, assumptions: [] } })).toThrow(/estimated scale/);
    expect(() => roomImportSchema.parse({ ...layout, room: { ...layout.room, height: Infinity } })).toThrow();
    expect(layout).toEqual(original);
  });
  test('appends, keeps evidence and does not duplicate imports on retries', () => {
    const existing = makeRoomItem({ id: 'old', kind: 'chair', label: 'Existing chair' }, DEFAULT_ROOM);
    const first = prepareRoomImport(layout, DEFAULT_ROOM, [existing], [], () => 'new');
    expect(first.items).toHaveLength(2);
    expect(first.items[0]).toBe(existing);
    expect(first.items[1]?.importId).toBe(layout.importId);
    expect(first.room.imports?.[0]?.provenance).toEqual(provenance);
    const repeated = prepareRoomImport(layout, first.room, first.items, [], () => { throw new Error('No new IDs on retry'); });
    expect(repeated.duplicate).toBe(true);
    expect(repeated.items).toBe(first.items);
  });
  test('rejects append resizing and invalid device links; explicit replace works', () => {
    const existing = makeRoomItem({ id: 'old', kind: 'chair', label: 'Existing' }, DEFAULT_ROOM);
    const resized = { ...layout, room: { ...layout.room, width: 7 } };
    expect(() => prepareRoomImport(resized, DEFAULT_ROOM, [existing], [], () => 'new')).toThrow(/preserve/);
    expect(prepareRoomImport({ ...resized, mode: 'replace' }, DEFAULT_ROOM, [existing], [], () => 'new').items).toHaveLength(1);
    const linked = { ...layout, items: [{ ...layout.items[0]!, tag: 'TV-01' }] };
    expect(() => prepareRoomImport(linked, DEFAULT_ROOM, [], [], () => 'new')).toThrow(/Unknown schematic tag/);
    expect(prepareRoomImport(linked, DEFAULT_ROOM, [], ['TV-01'], () => 'new').items[0]?.tag).toBe('TV-01');
    expect(() => prepareRoomImport({ ...linked, items: [...linked.items, ...linked.items] }, DEFAULT_ROOM, [], ['TV-01'], () => 'new')).toThrow(/already contains/);
  });
  test('project JSON keeps room, source metadata and legacy compatibility', () => {
    const prepared = prepareRoomImport(layout, DEFAULT_ROOM, [], [], () => 'new');
    const legacy = { kind: 'av-schematic', version: 1, nodes: [], edges: [] };
    expect(parseProject(JSON.stringify(legacy)).room).toBeUndefined();
    const project = parseProject(JSON.stringify({ ...legacy, room: prepared.room, roomItems: prepared.items }));
    expect(project.room).toEqual(prepared.room);
    expect(project.roomItems).toEqual(prepared.items);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    const manual = { ...project, room: { ...prepared.room, name: '' }, roomItems: [{ ...prepared.items[0], label: '  User label  ', note: '', rotation: 450 }] };
    expect(parseProject(JSON.stringify(manual)).roomItems?.[0]).toMatchObject({ label: '  User label  ', note: '', rotation: 450 });
    expect(() => parseProject(JSON.stringify({ ...legacy, room: { ...prepared.room, width: -1 } }))).toThrow();
  });
});
