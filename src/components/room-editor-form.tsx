import { useEffect, useRef, type FormEvent } from "react";
import { useT } from "@/lib/i18n";
import type { DeviceIdentity } from "@/lib/device-identity";
import { KIND_DEFAULTS, type ItemKind, type MountKind, type RoomItem, type RoomSpec } from "@/lib/room";

export type RoomEdit = Pick<RoomSpec, "name" | "width" | "height" | "depth">;
export type RoomItemEdit = Pick<RoomItem, "label" | "position" | "size" | "rotation" | "mount" | "note">;
export type RoomEditor = { type: "room" } | { type: "add" } | { type: "item"; item: RoomItem };

const field = "w-full rounded border border-[var(--hairline)] bg-background px-2 py-1.5";
const kinds = Object.keys(KIND_DEFAULTS) as ItemKind[];
const mounts: MountKind[] = ["floor", "wall", "ceiling", "table", "rack"];

export function RoomEditorForm({ editor, room, devices, close, saveRoom, addItem, saveItem }: {
  editor: RoomEditor;
  room: RoomSpec;
  devices: DeviceIdentity[];
  close: () => void;
  saveRoom: (room: RoomEdit) => void;
  addItem: (kind: ItemKind, label: string, deviceId: string) => void;
  saveItem: (id: string, patch: RoomItemEdit) => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const title = editor.type === "room" ? "Room setup" : editor.type === "add" ? "Add room object" : "Edit room object";
  const numeric = (name: string, label: string, value: number, min?: number, max?: number) =>
    <label className="block min-w-0">
      <span className="block">{t(label)}</span>
      <input className={field} name={name} type="number" required step="any" min={min} max={max} defaultValue={value} />
    </label>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    const number = (key: string) => Number(value(key));
    if (editor.type === "room") {
      saveRoom({ name: value("name").trim() || room.name, width: number("w"), height: number("h"), depth: number("d") });
    } else if (editor.type === "add") {
      addItem(value("kind") as ItemKind, value("label").trim(), value("device"));
    } else {
      saveItem(editor.item.id, {
        label: value("label").trim() || editor.item.label,
        position: { x: number("x"), y: number("y"), z: number("z") },
        size: { w: number("w"), h: number("h"), d: number("d") },
        rotation: number("rotation"), mount: value("mount") as MountKind, note: value("note"),
      });
    }
    close();
  };
  const dimensions = (width: number, height: number, depth: number) =>
    <div className="grid grid-cols-3 gap-2">
      {numeric("w", "Width (m)", width, 0.001, 1000)}
      {numeric("h", "Height (m)", height, 0.001, 1000)}
      {numeric("d", "Depth (m)", depth, 0.001, 1000)}
    </div>;
  return <dialog ref={dialog} aria-label={t(title)}
    className="m-auto w-[min(30rem,calc(100%-2rem))] max-h-[85vh] overflow-auto rounded-xl border border-[var(--hairline)] bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onKeyDown={(event) => event.stopPropagation()}>
    <h2 className="mb-4 text-lg font-semibold">{t(title)}</h2>
    <form className="space-y-3 text-sm" onSubmit={submit}>
      {editor.type === "room" && <>
        <label className="block">{t("Room name")}<input className={field} name="name" required maxLength={200} defaultValue={room.name} /></label>
        {dimensions(room.width, room.height, room.depth)}
        <p className="text-muted-foreground">{t("Object centres outside the new dimensions move to the nearest room boundary.")}</p>
      </>}
      {editor.type === "add" && <>
        <label className="block">{t("Object type")}
          <select className={field} name="kind">{kinds.map((kind) => <option key={kind} value={kind}>{t(kind)}</option>)}</select>
        </label>
        <label className="block">{t("Object label")}<input className={field} name="label" maxLength={200} /></label>
        <label className="block">{t("Link to schematic device")}
          <select className={field} name="device">
            <option value="">{t("No device link")}</option>
            {devices.map(({ id, tag, name }) => <option key={id} value={id}>{[tag, name].filter(Boolean).join(" · ") || id}</option>)}
          </select>
        </label>
      </>}
      {editor.type === "item" && <>
        <label className="block">{t("Object label")}<input className={field} name="label" required maxLength={200} defaultValue={editor.item.label} /></label>
        <div className="grid grid-cols-3 gap-2">
          {numeric("x", "X (m)", editor.item.position.x, 0, room.width)}
          {numeric("y", "AFF (m)", editor.item.position.y, 0, room.height)}
          {numeric("z", "Z (m)", editor.item.position.z, 0, room.depth)}
        </div>
        {dimensions(editor.item.size.w, editor.item.size.h, editor.item.size.d)}
        <div className="grid grid-cols-2 gap-2">
          {numeric("rotation", "Rotation (°)", editor.item.rotation)}
          <label className="block">{t("Mount")}
            <select className={field} name="mount" defaultValue={editor.item.mount}>
              {mounts.map((mount) => <option key={mount} value={mount}>{t(mount)}</option>)}
            </select>
          </label>
        </div>
        <label className="block">{t("Object notes")}<textarea className={field} name="note" maxLength={2000} defaultValue={editor.item.note} /></label>
      </>}
      <footer className="flex justify-end gap-2 pt-2">
        <button type="button" className="rounded-md px-3 py-1.5 underline" onClick={close}>{t("Cancel")}</button>
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">{t(editor.type === "add" ? "Place object" : "Apply changes")}</button>
      </footer>
    </form>
  </dialog>;
}
