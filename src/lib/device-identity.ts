import type { Node } from "@xyflow/react";

export type DeviceIdentity = { id: string; tag: string; name: string };
export type DeviceLink = {
  tag?: string;
  deviceId?: string;
  linkStatus?: "needs-review" | "unlinked";
};

export const tagKey = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : "";

export function deviceIdentities(nodes: Node[]): DeviceIdentity[] {
  return nodes.filter((node) => node.type === "database").map((node) => ({
    id: node.id,
    tag: typeof node.data.tag === "string" ? node.data.tag : "",
    name: typeof node.data.name === "string" ? node.data.name : "",
  }));
}

export function allocateTag(used: Set<string>, preferred = "DEV-01"): string {
  const tag = tagKey(preferred) || "DEV-01";
  if (!used.has(tag)) {
    used.add(tag);
    return tag;
  }
  const prefix = tag.replace(/-?\d+$/, "") || "DEV";
  let number = 1;
  let candidate: string;
  do {
    candidate = `${prefix}-${String(number++).padStart(2, "0")}`;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

export function matchDevice(devices: DeviceIdentity[], reference: string, tagsOnly = false) {
  if (!tagsOnly) {
    const exact = devices.find((device) => device.id === reference);
    if (exact) return [exact];
  }
  const key = tagKey(reference);
  return devices.filter((device) => !!key && (
    tagKey(device.tag) === key || (!tagsOnly && tagKey(device.name) === key)
  ));
}

export function migrateDeviceLink<T extends DeviceLink>(item: T, devices: DeviceIdentity[]): T {
  if (item.deviceId || item.linkStatus || !item.tag) return item;
  const matches = matchDevice(devices, item.tag, true);
  return matches.length === 1
    ? { ...item, deviceId: matches[0]!.id }
    : { ...item, linkStatus: "needs-review" };
}

export function deviceLinkNeedsReview(item: DeviceLink, tags: ReadonlyMap<string, string>) {
  return item.linkStatus === "needs-review" || (!!item.deviceId && !tags.has(item.deviceId));
}

export function displayDeviceTag(item: DeviceLink, tags: ReadonlyMap<string, string>) {
  return (item.deviceId ? tags.get(item.deviceId) : undefined) ?? item.tag;
}
