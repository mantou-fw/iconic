import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/health")({
  server: { handlers: { GET: () => Response.json({ service: "iconic", instance: process.env.ICONIC_INSTANCE ?? null, runtime: "node", framework: "tanstack-start" }) } },
});
