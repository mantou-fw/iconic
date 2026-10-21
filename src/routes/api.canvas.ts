import { createFileRoute } from '@tanstack/react-router';
import { handleCanvasRequest } from '../server/canvas-handler';
export const Route = createFileRoute('/api/canvas')({
  server: { handlers: { POST: ({ request }) => handleCanvasRequest(request) } },
});
