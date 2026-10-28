import { useEffect, useRef, useState } from "react";
import { validateActions } from "../../desktop/commands.mjs";

import type { SignalType } from "./signal-types";
import type { ItemKind, MountKind } from "./room";
import type { ProductImport, RoomImport } from "./ai-imports";

export type AIStatus = "off" | "connecting" | "live";

export type PortSpec = {
  label?: string;
  connector?: string;
  signal?: SignalType;
};

/** Commands an agent may send to the canvas. */
export type AICommand =
  | ({ type: "import_product" } & ProductImport)
  | ({ type: "import_room_layout" } & RoomImport)
  | { type: "get_state" }
  | { type: "clear" }
  | {
      type: "set_room";
      name?: string;
      width?: number;
      depth?: number;
      height?: number;
      /** Wipe existing contents before laying the room out again. */
      clearItems?: boolean;
    }
  | {
      type: "add_room_item";
      kind: ItemKind;
      label: string;
      /** Device tag on the schematic this item represents. */
      tag?: string;
      position?: { x?: number; y?: number; z?: number };
      size?: { w?: number; h?: number; d?: number };
      rotation?: number;
      mount?: MountKind;
      color?: string;
      note?: string;
    }
  | { type: "clear_room" }
  | { type: "get_room" }
  | {
      type: "add_rack";
      tag?: string;
      name?: string;
      /** Total rack units; defaults to 24. */
      units?: number;
      equipment?: {
        label: string;
        tag?: string;
        /** Lowest rack unit occupied; 1 is the bottom. Omit to stack upward. */
        u?: number;
        /** Height in rack units; defaults to 1. */
        height?: number;
        color?: string;
      }[];
      position?: { x: number; y: number };
    }
  | {
      type: "add_title_block";
      /** Any subset of the sheet's identification fields. */
      fields?: Record<string, string>;
      position?: { x: number; y: number };
    }
  | {
      type: "add_zone";
      name: string;
      color?: string;
      position?: { x: number; y: number };
      width?: number;
      height?: number;
    }
  | {
      type: "add_device";
      tag?: string;
      name?: string;
      manufacturer?: string;
      model?: string;
      inputs?: PortSpec[];
      outputs?: PortSpec[];
      position?: { x: number; y: number };
      /** Name of a zone to drop this device into. */
      zone?: string;
    }
  | { type: "add_text"; text: string; position?: { x: number; y: number } }
  | { type: "add_memo"; text: string; position?: { x: number; y: number } }
  | {
      type: "connect";
      from: string;
      fromPort?: string;
      to: string;
      toPort?: string;
      label?: string;
    }
  | { type: "delete_device"; tag: string }
  | { type: "layout" };

export type AIReply =
  | { type: "ack"; command: string; ok: true; detail?: unknown }
  | { type: "error"; command: string; ok: false; message: string }
  | { type: "state"; devices: unknown[]; cables: unknown[]; drawing?: unknown; room?: unknown };

/** Connects the editor to the local MCP command broker in TanStack Start. */
export function useAIBridge(handle: (cmd: AICommand) => AIReply | void) {
  const [status, setStatus] = useState<AIStatus>("connecting");
  const handler = useRef(handle);
  handler.current = handle;
  useEffect(() => {
    const abort = new AbortController();
    const key = "iconic-mcp-canvas-id";
    const canvasId = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, canvasId);
    const post = async (body: unknown) => {
      const response = await fetch('/api/canvas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
      if (!response.ok) throw new Error('Canvas bridge disconnected');
      return response.json();
    };
    const run = async () => {
      while (!abort.signal.aborted) {
        try {
          setStatus('live');
          const request = await post({ action: 'poll', canvasId });
          if (!request) continue;
          let reply: AIReply;
          try {
            validateActions([request.command]);
            reply = handler.current(request.command) ?? { type: 'error', command: request.command.type, ok: false, message: 'Unsupported command' };
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          } catch (error) {
            reply = { type: 'error', command: request.command.type, ok: false, message: error instanceof Error ? error.message : String(error) };
          }
          await post({ action: 'reply', canvasId, id: request.id, reply });
        } catch {
          if (abort.signal.aborted) break;
          setStatus('connecting');
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, 1500);
            abort.signal.addEventListener('abort', finish, { once: true });
          });
        }
      }
    };
    void run();
    return () => abort.abort();
  }, []);
  return status;
}
