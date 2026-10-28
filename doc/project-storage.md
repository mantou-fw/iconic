# Project databases and version history

The editor uses the official `@couchbase/lite-js` browser SDK in both the web app and Electron's isolated renderer. Each new project has a separate database named `iconic-project-<uuid>`. `iconic-project-catalog` stores the project list and last-opened project. The SDK stores data in the current origin's IndexedDB; this is not a native `.cblite2` file or a remote Couchbase Server connection.

The existing `av-schematic-db` remains untouched. On first use, its drawing, room, settings, legend and viewport are copied to a project with an initial version. Migration is marked complete only after the project and catalog entry are saved. JSON imports create new projects rather than overwrite the active drawing. The JSON kind remains `av-schematic`, version 1.

Each project stores a working document and immutable version documents. Autosave updates the working document; named versions preserve the complete drawing, room, images, settings, legend and viewport. Restoring a version creates both a backup of the current work and a new restored version, then updates the working document in one Couchbase Lite transaction. SDK revision IDs are concurrency tokens, not the user-facing history.

Writes are serialized per editor session and checked against the last observed working sequence. Concurrent changes from another tab are rejected rather than silently overwritten. Before project switching, imports or version operations the renderer flushes current work. The canvas remounts on project switches/restores so undo and pending timers cannot cross project boundaries. Save failures remain visible and block switching until retried or the current work is exported.

Storage remains local and scoped to the browser/Electron profile and origin. No Sync Gateway, Capella account, replication or cloud backup is configured. Named versions remain until explicitly removed by a future management feature; this implementation never automatically prunes them. Export JSON for a portable copy of the current drawing; version history stays in its project database. Browser storage quotas still apply.

Dependencies are installed with npm and pinned by package-lock.json. The SDK ships under its own Couchbase license (`node_modules/@couchbase/lite-js/LICENSE.txt`); packaging must retain its notices. The application license does not replace dependency licenses. Tests run the real SDK with `fake-indexeddb` on Node; production uses the browser's persistent IndexedDB.

`@couchbase/lite-js` 1.0.3 embeds Dexie 4.2.1 inside its published bundle and enforces a single Dexie version. The legacy reader's direct Dexie dependency is pinned to 4.2.1 as well; upgrade them together and verify the bundle's embedded version. This changes no legacy database name or schema. `npm run build` copies the Couchbase license into `.output/public/licenses/couchbase-lite.txt`, which is included in desktop and web packages.

References: [SDK installation](https://docs.couchbase.com/couchbase-lite-javascript/current/gs-install.html), [databases](https://docs.couchbase.com/couchbase-lite-javascript/current/database.html), [documents and transactions](https://docs.couchbase.com/couchbase-lite-javascript/current/document.html).
