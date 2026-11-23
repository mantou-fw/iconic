import { useEffect, useRef, useState } from "react";
import { ImportEvidence } from "@/components/import-evidence";
import { downloadBlob } from "@/lib/download";
import { useT } from "@/lib/i18n";
import { libraryFile, parseLibrary, ReusableLibrary, type LibraryContent, type LibraryEntry } from "@/lib/reusable-library";

const button = "rounded border border-[var(--hairline)] px-2 py-1 text-sm disabled:opacity-50";
const input = "min-w-0 rounded border border-[var(--hairline)] bg-background px-2 py-1.5 text-sm";
type DeviceOption = { id: string; tag: string; name: string };

export function ReusableLibraryDialog({ devices, captureDevice, captureRoom, onUse, onClose }: {
  devices: DeviceOption[];
  captureDevice: (id: string) => LibraryContent;
  captureRoom: () => LibraryContent;
  onUse: (item: LibraryContent, name: string, target?: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<ReusableLibrary>();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [version, setVersion] = useState<number>();
  const [device, setDevice] = useState(devices[0]?.id ?? "");
  const [saveKind, setSaveKind] = useState<LibraryContent["kind"]>("device");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let disposed = false;
    let opened: ReusableLibrary | undefined;
    void ReusableLibrary.open().then(async value => {
      opened = value;
      if (disposed) { value.close(); return; }
      const items = await value.list();
      if (!disposed) { setLibrary(value); setEntries(items); }
    }).catch(() => { if (!disposed) setError("Could not open the reusable library."); });
    return () => { disposed = true; opened?.close(); };
  }, []);
  const run = async (task: (source: ReusableLibrary) => Promise<void>) => {
    if (!library || busy) return;
    setBusy(true); setError("");
    try { await task(library); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const chosen = entries.find(entry => entry.id === selected);
  const latest = chosen?.revisions.at(-1);
  const revision = chosen?.revisions.find(item => item.number === version) ?? latest;
  const details = revision?.content;
  const match = search.trim().toLocaleLowerCase();
  const visible = entries.filter(entry => {
    const current = entry.revisions.at(-1)?.content;
    const words = current?.kind === "device" ? [current.device.name, current.device.manufacturer, current.device.model] : [current?.room.name];
    return (!favorites || entry.favorite) && [entry.name, ...words].some(word => word?.toLocaleLowerCase().includes(match));
  }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastUsed.localeCompare(a.lastUsed) || a.name.localeCompare(b.name));
  const capture = () => saveKind === "device" ? captureDevice(device) : captureRoom();
  const useRevision = (target?: string) => void run(async source => {
    if (!chosen || !details) return;
    setEntries(await source.markUsed(chosen.id));
    await onUse(details, chosen.name, target);
  });

  return <dialog ref={dialog} aria-label={t("Reusable library")}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => event.stopPropagation()}
    className="m-auto max-h-[85vh] w-[min(46rem,calc(100%-2rem))] overflow-auto rounded-xl border border-[var(--hairline)] bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40">
    <header className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{t("Reusable library")}</h2>
      <button className={button} disabled={busy} onClick={onClose}>{t("Close")}</button>
    </header>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{t(error)}</p>}
    {!library && !error && <p role="status">{t("Opening reusable library…")}</p>}
    {library && <div className="grid gap-5 sm:grid-cols-2">
      <section className="space-y-2">
        <input className={`${input} w-full`} aria-label={t("Search library")} placeholder={t("Search library")} type="search" value={search} onChange={event => setSearch(event.target.value)} />
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={favorites} onChange={event => setFavorites(event.target.checked)} />{t("Favorites only")}</label>
        <ul className="space-y-1">
          {visible.map(entry => <li key={entry.id} className="flex items-center gap-2">
            <button className={`${button} flex-1 text-left`} aria-pressed={entry.id === selected} onClick={() => { setSelected(entry.id); setVersion(undefined); }}>
              {entry.name} <span className="text-xs text-muted-foreground">· v{entry.revisions.length}</span>
            </button>
            <button className={button} disabled={busy} aria-pressed={entry.favorite} aria-label={`${t("Favorite")}: ${entry.name}`}
              onClick={() => void run(async source => { setEntries(await source.setFavorite(entry.id, !entry.favorite)); })}>{entry.favorite ? "★" : "☆"}</button>
          </li>)}
        </ul>
        {!visible.length && <p className="text-sm text-muted-foreground">{t("No matching library entries.")}</p>}
        <div className="flex flex-wrap gap-1">
          <button className={button} disabled={busy} onClick={() => file.current?.click()}>{t("Import library")}</button>
          <button className={button} disabled={busy} onClick={() => downloadBlob(new Blob([JSON.stringify(libraryFile(entries))], { type: "application/json" }), "iconic-library.json")}>{t("Export library")}</button>
          <input ref={file} type="file" accept=".json" hidden onChange={event => {
            const uploaded = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!uploaded) return;
            void run(async source => {
              let imported;
              try { imported = parseLibrary(await uploaded.text()); }
              catch { throw new Error("This file is not a valid library."); }
              setEntries(await source.import(imported));
            });
          }} />
        </div>
      </section>
      <section className="space-y-3">
        {chosen && revision && details && <div className="rounded-lg border border-[var(--hairline)] p-3 text-sm">
          <h3 className="font-semibold">{chosen.name}</h3>
          <label className="my-2 flex items-center gap-2">{t("Definition version")}
            <select className={input} value={revision.number} onChange={event => setVersion(Number(event.target.value))}>
              {[...chosen.revisions].reverse().map(item => <option key={item.number} value={item.number}>v{item.number} · {new Date(item.createdAt).toLocaleDateString()}</option>)}
            </select>
          </label>
          {details.kind === "device" ? <>
            <p>{[details.device.manufacturer, details.device.model].filter(Boolean).join(" · ")}</p>
            <ul className="my-1 space-y-0.5">{details.device.ports.map(port => <li key={port.id}>{port.label} · {port.connector || port.signal}</li>)}</ul>
            {details.device.provenance && <ImportEvidence provenance={details.device.provenance} />}
          </> : <>
            <p>{details.room.name} · {details.items.length} {t("Room objects")}</p>
            {details.room.imports?.map(entry => <ImportEvidence key={entry.importId} provenance={entry.provenance} estimated={entry.dimensionBasis === "estimated"} />)}
          </>}
          <div className="mt-2 flex flex-wrap gap-1">
            <button className={button} disabled={busy} onClick={() => useRevision()}>{t(details.kind === "device" ? "Place device instance" : "Create project from room template")}</button>
            {details.kind === "device" && !!device && <button className={button} disabled={busy} onClick={() => useRevision(device)}>{t("Apply to selected device")}</button>}
          </div>
        </div>}
        <form className="grid gap-2 text-sm" onSubmit={event => {
          event.preventDefault();
          void run(async source => { setEntries(await source.save(name, capture())); setName(""); });
        }}>
          <label className="flex flex-wrap items-center gap-2">{t("Save from project")}
            <select className={input} value={saveKind} onChange={event => setSaveKind(event.target.value === "room" ? "room" : "device")}>
              <option value="device">{t("Device definition")}</option><option value="room">{t("Room template")}</option>
            </select>
          </label>
          {!!devices.length && <label className="flex flex-wrap items-center gap-2">{t("Schematic device")}
            <select className={input} value={device} onChange={event => setDevice(event.target.value)}>
              {devices.map(entry => <option key={entry.id} value={entry.id}>{[entry.tag, entry.name].filter(Boolean).join(" · ") || entry.id}</option>)}
            </select>
          </label>}
          <input className={input} aria-label={t("Library entry name")} placeholder={t("Library entry name")} value={name} onChange={event => setName(event.target.value)} maxLength={200} required />
          <div className="flex flex-wrap gap-1">
            <button className={button} disabled={busy || !name.trim() || (saveKind === "device" && !device)}>{t("Save new entry")}</button>
            {chosen && latest?.content.kind === saveKind && <button type="button" className={button} disabled={busy || (saveKind === "device" && !device)} onClick={() => void run(async source => {
              setEntries(await source.save(chosen.name, capture(), chosen.id));
              setVersion(undefined);
            })}>{t("Save as new version")}</button>}
          </div>
        </form>
      </section>
    </div>}
  </dialog>;
}
