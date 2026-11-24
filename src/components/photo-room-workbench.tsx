import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Box, Camera, ClipboardCopy, ImagePlus, Layers2, Orbit, X } from "lucide-react";

import { roomViewFeature } from "@/lib/feature-imports";
import { useT } from "@/lib/i18n";
import {
  demoPhotoRoom,
  isKnownPhotoDimension,
  PHOTO_ROOM_MAX_JSON,
  PhotoRoomInputError,
  photoRoomPrompt,
  readPhotoRoomDraft,
  type KnownPhotoDimension,
  type PhotoRoomDraft,
} from "@/lib/photo-room";
import type { ProjectFile } from "@/lib/project";
import { cn } from "@/lib/utils";

const Scene = lazy(async () => ({ default: (await roomViewFeature.load()).RoomOrbitPreview }));
const UPLOAD_LIMIT = 20 * 1024 * 1024;
const ALLOWED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEMO = "/demo/photo-room.webp";
type Surface = "photo" | "compare" | "orbit";
type Pose = "front" | "iso" | "top";
type LocalPhoto = { fileName: string; url: string };
type PreviewError = { message: string; detail?: string };
const secondary = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
const control = "min-h-10 w-full rounded-md border border-[var(--hairline)] bg-background px-2.5 py-2 text-sm focus-visible:outline-2";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PhotoRoomWorkbench({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (project: ProjectFile, name: string) => Promise<void>;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const photoReadRevision = useRef(0);
  const applying = useRef(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"demo" | "external">("demo");
  const [photo, setPhoto] = useState<LocalPhoto>();
  const [brokenPhoto, setBrokenPhoto] = useState(false);
  const [readyPhoto, setReadyPhoto] = useState<string>();
  const [draft, setDraft] = useState<PhotoRoomDraft | undefined>(demoPhotoRoom);
  const [axis, setAxis] = useState<KnownPhotoDimension["axis"]>("width");
  const [metres, setMetres] = useState("");
  const [json, setJson] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState("");
  const [surface, setSurface] = useState<Surface>("compare");
  const [pose, setPose] = useState<{ view: Pose; revision: number }>({ view: "front", revision: 0 });
  const [blend, setBlend] = useState(52);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<PreviewError>();

  const image = source === "demo" ? DEMO : photo?.url;
  const known: KnownPhotoDimension | undefined = metres.trim() ? { axis, meters: Number(metres) } : undefined;
  const invalidKnown = !!known && !isKnownPhotoDimension(known);
  const room = draft?.project.room;
  const items = draft?.project.roomItems ?? [];
  const hasScene = !!draft && !!room && surface !== "photo";

  useEffect(() => {
    const modal = dialog.current;
    const previous = document.activeElement;
    modal?.showModal();
    return () => {
      modal?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => { photoReadRevision.current++; }, []);

  function selectSurface(next: Surface) {
    setSurface(next);
    if (next !== "photo") setPose(old => ({ view: next === "orbit" ? "iso" : "front", revision: old.revision + 1 }));
  }

  function showDemo() {
    if (source === "demo") return;
    photoReadRevision.current++;
    setSource("demo");
    setDraft(demoPhotoRoom());
    setError(undefined);
    setSelected(null);
    setBrokenPhoto(false);
    selectSurface("compare");
  }

  function showExternal() {
    if (source === "external") return;
    setSource("external");
    setDraft(undefined);
    setError(undefined);
    setSelected(null);
    setBrokenPhoto(false);
    selectSurface("photo");
  }

  function loadPhoto(file: File) {
    if (!ALLOWED_IMAGES.has(file.type) || !file.size || file.size > UPLOAD_LIMIT) {
      resetDraft();
      setError({ message: "Choose a JPEG, PNG or WebP image up to 20 MB." });
      return;
    }
    const url = URL.createObjectURL(file);
    photoReadRevision.current++;
    setPhoto({ url, fileName: file.name });
    setJson("");
    setDraft(undefined);
    setBrokenPhoto(false);
    setReadyPhoto(undefined);
    setSelected(null);
    setError(undefined);
    selectSurface("photo");
  }

  function changeInput(value: string) {
    setJson(value);
    setDraft(undefined);
    setError(undefined);
    setSelected(null);
    selectSurface("photo");
  }

  function resetDraft() {
    setDraft(undefined);
    setError(undefined);
    setClipboardStatus("");
    setSelected(null);
    selectSurface("photo");
  }

  function reviewDraft() {
    if (!photo || readyPhoto !== photo.url || brokenPhoto) {
      setError({ message: "Choose a photo before reviewing a draft." });
      return;
    }
    try {
      setDraft(readPhotoRoomDraft(json, known));
      setError(undefined);
      setSelected(null);
      selectSurface("compare");
    } catch (cause) {
      setDraft(undefined);
      setError(cause instanceof PhotoRoomInputError
        ? { message: cause.message, detail: cause.detail }
        : { message: "The room draft does not match the required format." });
    }
  }

  async function readFile(file: File) {
    if (file.size > PHOTO_ROOM_MAX_JSON) { setError({ message: "The room draft is too large." }); return; }
    const revision = ++photoReadRevision.current;
    try {
      const text = await file.text();
      if (photoReadRevision.current === revision) changeInput(text);
    } catch {
      if (photoReadRevision.current === revision) setError({ message: "Could not open that file." });
    }
  }

  async function copyPrompt() {
    const prompt = photoRoomPrompt(known);
    try {
      await navigator.clipboard.writeText(prompt);
      setClipboardStatus("Prompt copied");
    } catch {
      setPromptOpen(true);
      setClipboardStatus("Could not copy the prompt. Select it below and copy it manually.");
    }
  }

  async function apply() {
    if (!draft || applying.current) return;
    applying.current = true;
    setBusy(true);
    setError(undefined);
    try { await onCreate(draft.project, (room?.name || t("Room draft")).slice(0, 200)); }
    catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "Could not open that file." });
      applying.current = false;
      setBusy(false);
    }
  }

  const viewOptions = [
    { id: "photo", label: "Photo", icon: Camera },
    { id: "compare", label: "Compare", icon: Layers2 },
    { id: "orbit", label: "Orbit", icon: Orbit },
  ] as const;
  const poses = [{ id: "front", label: "Front" }, { id: "iso", label: "Dollhouse" }, { id: "top", label: "Top" }] as const;

  return (
    <dialog ref={dialog} aria-labelledby="photo-room-title" onKeyDown={event => event.stopPropagation()}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[94dvh] w-[min(76rem,96vw)] max-w-none overflow-y-auto overscroll-contain rounded-2xl border border-[var(--hairline)] bg-background p-0 text-foreground backdrop:bg-black/55">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-4 md:px-7">
        <div>
          <h2 id="photo-room-title" className="text-balance text-2xl font-semibold tracking-tight">{t("Photo to 3D Room")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Start with a photo. Review an editable room.")}</p>
        </div>
        <button type="button" aria-label={t("Close")} disabled={busy} onClick={onClose}
          className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:outline-2 disabled:opacity-50"><X size={20} /></button>
      </header>

      <div className="grid min-w-0 items-start gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("Room source photo")}>
              <button type="button" className={cn(secondary, source === "demo" && "bg-accent")} aria-pressed={source === "demo"} onClick={showDemo} disabled={busy}>
                <Camera size={15} aria-hidden="true" /> {t("Use demo photo")}
              </button>
              <button type="button" className={cn(secondary, source === "external" && "bg-accent")} aria-pressed={source === "external"} onClick={showExternal} disabled={busy}>
                <ImagePlus size={15} aria-hidden="true" /> {t("Use your own photo")}
              </button>
            </div>
            <div className="flex rounded-lg border border-[var(--hairline)] p-0.5" role="group" aria-label={t("Room draft")}>
              {viewOptions.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" disabled={busy || (id !== "photo" && !draft)} aria-pressed={surface === id} onClick={() => selectSurface(id)}
                  className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-2 disabled:opacity-45", surface === id && "bg-accent")}>
                  <Icon size={14} aria-hidden="true" /> {t(label)}
                </button>
              ))}
            </div>
          </div>

          <div className="relative isolate grid h-[clamp(19rem,56dvh,39rem)] min-w-0 place-items-center overflow-hidden rounded-xl border border-[var(--hairline)] bg-[#dce2e7]">
            {hasScene && room && <div className="absolute inset-0">
              <SceneBoundary key={source} fallback={<p role="status" className="absolute bottom-14 left-3 right-3 z-20 rounded-md bg-background p-3 text-sm text-foreground">{t("3D preview is unavailable on this device. Review the object list below.")}</p>}>
                <Suspense fallback={<p role="status" className="absolute bottom-14 left-3 z-20 rounded-md bg-background px-3 py-2 text-sm text-foreground">{t("Loading 3D preview…")}</p>}>
                  <Scene room={room} items={items} selected={selected} onSelect={setSelected} view={pose.view} revision={pose.revision} />
                </Suspense>
              </SceneBoundary>
            </div>}
            {image && !brokenPhoto ? <img key={image} src={image}
              alt={surface === "orbit" ? "" : t(source === "demo" ? "Synthetic demo photo" : "Room source photo")}
              className="pointer-events-none absolute inset-0 size-full object-contain motion-safe:transition-opacity motion-safe:duration-[420ms] motion-safe:ease-out"
              onLoad={() => setReadyPhoto(image)}
              onError={() => { setBrokenPhoto(true); setDraft(undefined); setError({ message: "Choose a JPEG, PNG or WebP image up to 20 MB." }); }}
              style={{ opacity: surface === "photo" ? 1 : surface === "compare" ? blend / 100 : 0 }} /> : (
              <div className="relative p-4 text-center text-slate-800">
                <ImagePlus className="mx-auto mb-2" size={28} aria-hidden="true" />
                <p className="font-medium">{t("Source photo not selected")}</p>
              </div>
            )}
            {image && surface !== "orbit" && <span className="absolute left-3 top-3 max-w-[85%] truncate rounded-md bg-slate-950/85 px-2.5 py-1.5 text-xs font-medium text-white">
              {source === "demo" ? t("Synthetic demo photo") : photo?.fileName}
            </span>}
            {hasScene && <div className="absolute bottom-3 right-3 z-10 flex flex-wrap rounded-lg bg-background text-foreground p-0.5 shadow-sm" role="group" aria-label={t("3D room view")}>
              {poses.map(({ id, label }) => <button key={id} type="button" disabled={busy} aria-pressed={pose.view === id}
                onClick={() => { if (id !== "front") setSurface("orbit"); setPose(old => ({ view: id, revision: old.revision + 1 })); }}
                className={cn("min-h-9 rounded-md px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-2", pose.view === id && "bg-accent")}>{t(label)}</button>)}
            </div>}
          </div>

          {surface === "compare" && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <label className="flex min-h-8 items-center gap-2 text-xs font-medium">
              {t("Photo–model blend")} <input type="range" min="0" max="100" value={blend} onChange={event => setBlend(Number(event.currentTarget.value))} className="w-24 accent-[var(--primary)]" />
            </label>
            <p className="text-xs text-muted-foreground">{t("Approximate alignment. This is not a calibrated overlay.")}</p>
          </div>}
          {surface === "orbit" && <p className="text-xs text-muted-foreground">{t("Drag to orbit. Use the view buttons for fixed angles.")}</p>}
          {source === "external" && <>
            <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
              onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) loadPhoto(file); }} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" className={secondary} disabled={busy} onClick={() => imageInput.current?.click()}><ImagePlus size={15} aria-hidden="true" /> {t("Choose a photo")}</button>
              <span className="text-xs text-muted-foreground">{t("JPEG, PNG or WebP, up to 20 MB")}</span>
            </div>
          </>}
        </section>

        <section className="min-w-0 lg:border-l lg:border-[var(--hairline)] lg:pl-5">
          {source === "external" && (
            <div className="mb-5 space-y-3 border-b border-[var(--hairline)] pb-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{t("Attach the same photo to your own vision-capable AI client, then copy the returned room draft here. Iconic does not upload your photo.")}</p>
              <fieldset disabled={busy}>
                <legend className="mb-1 text-sm font-medium">{t("Known dimension")}</legend>
                <div className="grid grid-cols-[1fr_1.45fr] gap-2">
                  <select aria-label={t("Known dimension")} className={control} value={axis}
                    onChange={event => { setAxis(event.currentTarget.value as KnownPhotoDimension["axis"]); resetDraft(); }}>
                    <option value="width">{t("Width (m)")}</option><option value="depth">{t("Depth (m)")}</option><option value="height">{t("Height (m)")}</option>
                  </select>
                  <input type="number" min="0.5" max={axis === "height" ? 15 : 60} step="any" inputMode="decimal" aria-label={t("Optional room dimension in metres")} aria-invalid={invalidKnown}
                    className={control} value={metres} placeholder="m" onChange={event => { setMetres(event.currentTarget.value); resetDraft(); }} />
                </div>
              </fieldset>
              {invalidKnown && <p role="status" className="text-xs text-muted-foreground">{t("Enter a valid known room dimension.")}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondary} disabled={busy || invalidKnown} onClick={() => void copyPrompt()}><ClipboardCopy size={15} aria-hidden="true" />{t("Copy vision prompt")}</button>
                <button type="button" className="min-h-9 px-1 text-sm underline underline-offset-4" disabled={busy || invalidKnown} aria-expanded={promptOpen}
                  onClick={() => setPromptOpen(old => !old)}>{t("Vision prompt")}</button>
              </div>
              {clipboardStatus && <p role="status" className="text-xs text-muted-foreground">{t(clipboardStatus)}</p>}
              {promptOpen && !invalidKnown && <textarea readOnly value={photoRoomPrompt(known)} aria-label={t("Vision prompt")} className={cn(control, "h-24")} />}
              <label className="block text-sm font-medium">
                {t("Paste room draft JSON")}
                <textarea value={json} disabled={busy} maxLength={PHOTO_ROOM_MAX_JSON} spellCheck={false}
                  onChange={event => { photoReadRevision.current++; changeInput(event.currentTarget.value); }}
                  className={cn(control, "mt-1 block h-20 resize-y font-mono text-xs")} />
              </label>
              <input ref={jsonInput} type="file" accept="application/json,.json" hidden
                onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void readFile(file); }} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondary} disabled={busy} onClick={() => jsonInput.current?.click()}>{t("Load JSON file")}</button>
                <button type="button" className={secondary} disabled={busy || !json.trim() || invalidKnown} onClick={reviewDraft}>{t("Review draft")}<ArrowRight size={14} aria-hidden="true" /></button>
              </div>
              {draft && <p role="status" className="text-xs text-muted-foreground">{t("Draft reviewed")}</p>}
            </div>
          )}

          {draft && room && <>
            <header>
              <div className="flex items-center gap-2 text-sm font-semibold"><Box size={16} aria-hidden="true" />{t(source === "demo" ? "Demo model" : "Room draft")}</div>
              <h3 className="mt-2 break-words text-xl font-semibold tracking-tight">{room.name}</h3>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">{room.width} × {room.depth} × {room.height} m</p>
              <p className="mt-2 text-xs font-medium">{t(source === "demo" ? "Seeded layout, not AI extraction." : "Estimated from photo")}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(source === "demo" ? "Reference: 2.4 m table length" : "Room dimensions are approximate. Verify on site before installation.")}</p>
            </header>

            <h4 className="mb-1 mt-4 text-sm font-semibold">{t(source === "demo" ? "Visible objects" : "Draft objects")} <span className="ml-1 tabular-nums text-muted-foreground">{items.length}</span></h4>
            <ul className="max-h-[15rem] divide-y divide-[var(--hairline)] overflow-auto border-y border-[var(--hairline)]" aria-label={t("Draft objects")}>
              {items.map(item => <li key={item.id}>
                <button type="button" aria-pressed={selected === item.id} disabled={busy} onClick={() => { setSelected(item.id); if (surface === "photo") selectSurface("orbit"); }}
                  className={cn("flex min-h-9 w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px]", selected === item.id && "bg-accent")}>
                  <span className="size-2.5 shrink-0 rounded-sm border border-current/20" aria-hidden="true" style={{ background: item.color }} />
                  <span className="min-w-0 flex-1 break-words font-medium">{item.label}</span>
                  <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{item.size.w} × {item.size.d} m</span>
                </button>
              </li>)}
            </ul>

            <details className="mt-4 text-xs">
              <summary className="cursor-pointer py-1 text-sm font-medium">{t("Source and assumptions")}</summary>
              <ul className="my-2 grid gap-1 break-words text-muted-foreground">
                {draft.provenance.sources.map((entry, index) => <li key={index}>{entry.label}{entry.excerpt ? ` · ${entry.excerpt}` : ""}</li>)}
                {draft.provenance.assumptions.map((entry, index) => <li className="ml-4 list-disc" key={`a${index}`}>{entry}</li>)}
              </ul>
            </details>
          </>}

          {error && <div role="alert" className="my-3 break-words rounded-lg border border-red-500/40 p-2.5 text-sm">
            {t(error.message)}{error.detail && <p className="mt-1 text-xs text-muted-foreground">{error.detail}</p>}
          </div>}
        </section>
      </div>

      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] bg-background px-5 py-3 md:px-7">
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{t("Your current project will not change. The source photo is not saved in the new project.")}</p>
        <button type="button" disabled={busy || !draft} onClick={() => void apply()} className={primary}>
          {t(busy ? "Creating project…" : "Apply to new project")}<ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </dialog>
  );
}
