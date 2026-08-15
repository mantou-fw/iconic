import { useEffect, useRef, useState } from "react";

import type { SignalType } from "./signal-types";
import type { ItemKind, MountKind } from "./room";

export type AIStatus = "off" | "connecting" | "live";

export type PortSpec = {
  label?: string;
  connector?: string;
  signal?: SignalType;
};

/** Commands an agent may send to the canvas. */
export type AICommand =
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
  | { type: "state"; devices: unknown[]; cables: unknown[] };

/**
 * Keeps a socket open to the Bun relay and hands every inbound command to
 * `handle`, publishing whatever it returns back to the agent. Reconnects with
 * a simple backoff so the bridge survives dev-server restarts.
 */
export function useAIBridge(handle: (cmd: AICommand) => AIReply | void) {
  const [status, setStatus] = useState<AIStatus>("connecting");
  const handler = useRef(handle);
  handler.current = handle;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/ws?role=canvas`);

      socket.onopen = () => {
        attempts = 0;
        setStatus("live");
      };

      socket.onmessage = (event) => {
        let msg: { type?: string };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        // Relay bookkeeping, not a canvas command.
        if (!msg?.type || msg.type === "hello" || msg.type === "peers") return;

        try {
          const reply = handler.current(msg as AICommand);
          if (reply && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(reply));
          }
        } catch (err) {
          socket?.send(
            JSON.stringify({
              type: "error",
              command: msg.type,
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setStatus("connecting");
        attempts += 1;
        retry = setTimeout(connect, Math.min(1000 * attempts, 8000));
      };

      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return status;
}
