import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { randomBytes } from 'node:crypto';

export default createServerEntry({
  async fetch(request, options) {
    const nonce = randomBytes(18).toString('base64');
    // Nitro uses a fetch-compatible request; preserve its runtime identity.
    request.headers.set('x-iconic-csp-nonce', nonce);
    const response = await handler.fetch(request, { ...options, context: { ...options?.context, nonce } });
    if (process.env.NODE_ENV === 'production') {
      response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'`);
    }
    return response;
  },
});
