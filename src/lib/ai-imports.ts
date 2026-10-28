import type { z } from 'zod';
import { productSchema, roomImportSchema, provenanceSchema } from '../../shared/ai-imports.mjs';
import type { RoomItem, RoomSpec } from './room';

export type ProductImport = z.infer<typeof productSchema>;
export type RoomImport = z.infer<typeof roomImportSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type RoomImportRecord = Pick<RoomImport, 'importId' | 'dimensionBasis' | 'provenance'>;

/** Prepare the entire import before changing React state. No partial room edits. */
export function prepareRoomImport(
  input: RoomImport, room: RoomSpec, existing: RoomItem[], deviceTags: string[], nextId: () => string,
): { room: RoomSpec; items: RoomItem[]; duplicate: boolean } {
  const command = roomImportSchema.parse(input);
  if (room.imports?.some(entry => entry.importId === command.importId)) {
    return { room, items: existing, duplicate: true };
  }
  if (command.mode === 'append' && existing.length &&
      (['width', 'height', 'depth'] as const).some(key => room[key] !== command.room[key])) {
    throw new Error('Append must preserve the occupied room dimensions. Read get_room and fit the new items to the existing room.');
  }
  const knownTags = new Set(deviceTags.map(tag => tag.toLowerCase()));
  const usedTags = new Set((command.mode === 'append' ? existing : []).flatMap(item => item.tag ? [item.tag.toLowerCase()] : []));
  for (const item of command.items) {
    if (!item.tag) continue;
    const tag = item.tag.toLowerCase();
    if (!knownTags.has(tag)) throw new Error(`Unknown schematic tag "${item.tag}". Read list_devices or omit the tag.`);
    if (usedTags.has(tag)) throw new Error(`Room already contains tag "${item.tag}".`);
    usedTags.add(tag);
  }
  const items: RoomItem[] = command.items.map(item => ({ ...item, id: nextId(), importId: command.importId }));
  const record: RoomImportRecord = { importId: command.importId, dimensionBasis: command.dimensionBasis, provenance: command.provenance };
  return {
    room: { ...room, ...command.room, imports: [...(command.mode === 'append' ? room.imports ?? [] : []), record] },
    items: command.mode === 'append' ? [...existing, ...items] : items,
    duplicate: false,
  };
}
