import { serve, type Server, type ServerWebSocket } from "bun";
import index from "./index.html";

/**
 * Realtime bridge between the canvas and an AI agent.
 *
 * Both sides connect to /ws and declare a role. Each socket subscribes to the
 * topic named after its own role, and anything it sends is republished to the
 * other role — so the server stays a dumb relay and the message contract lives
 * entirely in `src/lib/ai-bridge.ts`.
 */
type Role = "canvas" | "ai";
type WSData = { role: Role };

const other = (role: Role): Role => (role === "ai" ? "canvas" : "ai");

const peers: Record<Role, number> = { canvas: 0, ai: 0 };

const server = serve({
  port: process.env.PORT ? Number(process.env.PORT) : 4321,
  routes: {
    "/ws": (req: Request, srv: Server<WSData>) => {
      const role: Role =
        new URL(req.url).searchParams.get("role") === "ai" ? "ai" : "canvas";
      if (srv.upgrade(req, { data: { role } })) return undefined as never;
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      const { role } = ws.data;
      peers[role] += 1;
      ws.subscribe(role);
      ws.send(JSON.stringify({ type: "hello", role, peers }));
      // Let the other side know someone showed up.
      server.publish(other(role), JSON.stringify({ type: "peers", peers }));
      console.log(`🔌 ${role} connected (canvas=${peers.canvas} ai=${peers.ai})`);
    },

    message(ws: ServerWebSocket<WSData>, raw) {
      const text = typeof raw === "string" ? raw : raw.toString();
      server.publish(other(ws.data.role), text);
    },

    close(ws: ServerWebSocket<WSData>) {
      const { role } = ws.data;
      peers[role] = Math.max(0, peers[role] - 1);
      ws.unsubscribe(role);
      server.publish(other(role), JSON.stringify({ type: "peers", peers }));
      console.log(`🔌 ${role} disconnected (canvas=${peers.canvas} ai=${peers.ai})`);
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`🤖 AI bridge at ${server.url.href.replace("http", "ws")}ws?role=ai`);
