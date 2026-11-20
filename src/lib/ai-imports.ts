import type { z } from 'zod';
import { productSchema, roomImportSchema, provenanceSchema } from '../../shared/ai-imports.mjs';
import { matchDevice, tagKey, type DeviceIdentity } from './device-identity';
import type { RoomItem, RoomSpec } from './room';

export type ProductImport = z.infer<typeof productSchema>;
export type RoomImport = z.infer<typeof roomImportSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type RoomImportRecord = Pick<RoomImport, 'importId' | 'dimensionBasis' | 'provenance'>;

/** Prepare the entire import before changing React state. No partial room edits. */
export function prepareRoomImport(
  input: RoomImport, room: RoomSpec, existing: RoomItem[], devices: DeviceIdentity[], nextId: () => string,
): { room: RoomSpec; items: RoomItem[]; duplicate: boolean } {
  const command = roomImportSchema.parse(input);
  if (room.imports?.some(entry => entry.importId === command.importId)) {
    return { room, items: existing, duplicate: true };
  }
  if (command.mode === 'append' && existing.length &&
      (['width', 'height', 'depth'] as const).some(key => room[key] !== command.room[key])) {
    throw new Error('Append must preserve the occupied room dimensions. Read get_room and fit the new items to the existing room.');
  }
  const usedIds = new Set((command.mode === 'append' ? existing : []).flatMap(item => {
    if (item.deviceId) return [item.deviceId];
    if (item.linkStatus || !item.tag) return [];
    const matches = matchDevice(devices, item.tag, true);
    return matches.length === 1 ? [matches[0]!.id] : [];
  }));
  const links = command.items.map(item => {
    if (!item.deviceId && !item.tag) return undefined;
    const matches = item.deviceId
      ? devices.filter(device => device.id === item.deviceId)
      : matchDevice(devices, item.tag!, true);
    if (!matches.length) {
      const subject = item.deviceId ? `schematic device ID "${item.deviceId}"` : `schematic tag "${item.tag}"`;
      throw new Error(`Unknown ${subject}. Read list_devices or omit the link.`);
    }
    if (matches.length > 1) throw new Error(`Ambiguous schematic tag "${item.tag}". Use deviceId from list_devices.`);
    const deviceId = matches[0]!.id;
    if (usedIds.has(deviceId)) throw new Error(`Room already contains device "${tagKey(matches[0]!.tag) || deviceId}".`);
    usedIds.add(deviceId);
    return deviceId;
  });
  const items: RoomItem[] = command.items.map((item, index) => ({
    ...item, deviceId: links[index], id: nextId(), importId: command.importId,
  }));
  const record: RoomImportRecord = { importId: command.importId, dimensionBasis: command.dimensionBasis, provenance: command.provenance };
  return {
    room: { ...room, ...command.room, imports: [...(command.mode === 'append' ? room.imports ?? [] : []), record] },
    items: command.mode === 'append' ? [...existing, ...items] : items,
    duplicate: false,
  };
}
