import { useEffect, useRef } from "react";

import { useT } from "@/lib/i18n";
import type { DeviceIdentity, DeviceLink } from "@/lib/device-identity";

export type PendingLink = {
  kind: "room" | "rack";
  itemId: string;
  rackId?: string;
  label: string;
  item: DeviceLink;
};

export function DeviceLinkReview({
  open, devices, duplicates, links, onClose, onResolve,
}: {
  open: boolean;
  devices: DeviceIdentity[];
  duplicates: DeviceIdentity[];
  links: PendingLink[];
  onClose: () => void;
  onResolve: (link: PendingLink, deviceId: string | undefined) => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="device-links-heading"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => event.stopPropagation()}
      className="fixed inset-0 m-auto max-h-[80vh] w-[600px] max-w-[92vw] overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="device-links-heading" className="font-semibold">{t("Review device references")}</h2>
        <button className="underline" onClick={onClose}>{t("Close")}</button>
      </header>
      {!!duplicates.length && (
        <section className="mt-4">
          <h3 className="text-sm font-semibold">{t("Duplicate device tags")}</h3>
          <p className="text-sm text-muted-foreground">{t("Give each device a unique tag on the schematic.")}</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {duplicates.map((device) => (
              <li key={device.id}>{device.tag} · {device.name} <code className="text-xs">{device.id}</code></li>
            ))}
          </ul>
        </section>
      )}
      {!!links.length && (
        <section className="mt-4">
          <p className="text-sm text-muted-foreground">{t("Choose a schematic device for each item or keep its tag unlinked.")}</p>
          {links.map((link) => (
            <label key={JSON.stringify([link.kind, link.rackId, link.itemId])} className="mt-2 block text-sm">
              {t(link.kind === "room" ? "Room item" : "Rack equipment")} · {link.label}
              {link.item.tag && ` · ${link.item.tag}`}
              <select className="mt-1 block w-full rounded-md border bg-background px-2 py-1"
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  onResolve(link, value === "unlinked" ? undefined : value.slice(3));
                }}>
                <option value="" disabled>{t("Choose a device")}</option>
                <option value="unlinked">{t("Keep tag unlinked")}</option>
                {devices.map((device) => (
                  <option key={device.id} value={`id:${device.id}`}>
                    {device.tag} · {device.name} ({device.id})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}
      {!duplicates.length && !links.length && <p className="mt-3 text-sm">{t("All device references have been reviewed.")}</p>}
    </dialog>
  );
}
