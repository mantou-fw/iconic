import { cp, mkdir } from 'node:fs/promises';
// The browser SDK is bundled into the web assets. Retain its license in both
// the portable web archive and Electron's bundled web resources.
const directory = new URL('../.output/public/licenses/', import.meta.url);
await mkdir(directory, { recursive: true });
await cp(new URL('../node_modules/@couchbase/lite-js/LICENSE.txt', import.meta.url), new URL('couchbase-lite.txt', directory));
