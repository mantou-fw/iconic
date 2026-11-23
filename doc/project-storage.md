# Project databases and version history

The editor uses the official `@couchbase/lite-js` browser SDK in both the web app and Electron's isolated renderer. Each new project has a separate database named `iconic-project-<uuid>`. `iconic-project-catalog` stores the project list and last-opened project. The SDK stores data in the current origin's IndexedDB; this is not a native `.cblite2` file or a remote Couchbase Server connection.

The existing `av-schematic-db` remains untouched. On first use, its drawing, room, settings, legend and viewport are copied to a project with an initial version. Migration is marked complete only after the project and catalog entry are saved. JSON imports create new projects rather than overwrite the active drawing. Portable JSON still uses kind `av-schematic`, version **1**. The reader also accepts early files with an omitted version and normalizes them to version 1; other explicit versions are rejected. This portable format is separate from database configuration version **2** and the internal `asset-refs-v1` encoding. See [project parsing](../src/lib/project.ts) and [validation](../src/lib/project-validation.ts).

## Asset and version layout

Each project stores a compact working graph, immutable version graphs, image assets and separate version-list metadata. Image nodes refer to immutable assets internally, so moving a node, editing text or naming another version does not rewrite unchanged image sources. Head, version, metadata and newly referenced assets commit together through `updateMultiple({ bestEffort: false })`. Restoring creates both a backup of the current work and a restored version in that transaction. SDK revision IDs are concurrency tokens, not user-facing version numbers.

[ProjectAssetCodec](../src/lib/project-assets.ts) hashes UTF-8 `JSON.stringify(source)` with SHA-256. The exact source string is preserved, including data-URL spelling and lone UTF-16 surrogates. Existing external or relative image URLs are not fetched. Reads and JSON exports replace internal references with their original source strings; embedded images remain portable, while external URLs retain their existing external dependencies. Assets are shared within one project database, not across projects.

`savedAt` is stored separately from the compact graph payload. Timestamp-only saves compare the compact payload and perform no write. A session cache remembers up to 64 source strings or approximately 32 MiB of UTF-16 source text, retaining one oversized source when necessary. Reopening or cache eviction can require hashing again. Version lists query small `version-info` documents through the `kind` index instead of enumerating every snapshot. These behaviors are implemented in [ProjectSession](../src/lib/project-store.ts).

Writes are serialized per editor session and checked against the last observed working sequence. Concurrent changes from another tab are rejected rather than silently overwritten. Before project switching, imports or version operations the renderer flushes current work. The canvas remounts on project switches/restores so undo and pending timers cannot cross project boundaries. Save failures remain visible and block switching until retried or the current work is exported.

## Migration and recovery

Existing project database names stay unchanged. Database configuration version 2 adds the `kind` index. An inline v1 project migrates into a complete shadow asset layout in one transaction. Original inline head and version documents remain untouched; a separate immutable backup preserves the exact original head payload. Original version IDs remain usable. Malformed payloads are retained verbatim for recovery, while intact versions can still be migrated.

If the schema upgrade or migration fails before a usable shadow layout exists, opening the project exposes a read-only recovery session. It can export the original raw JSON, including through a lower-configuration fallback when only the old layout opens. That fallback cannot perform normal project reads, saves, checkpoints, restores or version listing. Retrying opening can retry migration; it does not reset the original data.

The schema upgrade closes existing old connections, but an older application can subsequently reopen the database. Migrated sessions retain the original head's SDK sequence, subscribe to changes and check that sequence before and after writes. An older writer therefore produces a visible conflict instead of silently replacing either saved branch. A race can let the new transaction commit and then report divergence; both saved copies remain available. There is no automatic merge, baseline reset or deletion.

If an older-version conflict appears in an open editor, **use File → Save project before reopening** to preserve any unsaved canvas work. On reopening, the recovery screen offers **Export current project data** and **Export older-version project data** for the two saved copies. Import the chosen JSON as a new project. `readMigrationBackup(versionId?)` also exposes exact retained original payloads. See the [real-SDK recovery and conflict tests](../src/lib/project-asset-storage.test.ts).

Migration needs additional free space: it retains old documents and writes assets, compact shadows, metadata and another full original-head backup. It does **not** shrink an existing database. No automatic version pruning or asset garbage collection is implemented. Storage remains local to the browser/Electron profile and origin; no replication or cloud backup is configured. JSON exports contain the current drawing, while version history remains in its project database. Browser quotas still apply.

## Deterministic write-volume benchmark

Run the [benchmark regression test](../src/lib/project-storage.benchmark.test.ts):

```sh
ICONIC_STORAGE_BENCHMARK_REPORT=1 npm test -- src/lib/project-storage.benchmark.test.ts --reporter=verbose --silent=false
```

It uses the installed `@couchbase/lite-js` **1.0.3** with `fake-indexeddb` **6.2.6**. Both layouts execute real SDK transactions. The inline baseline freezes successful sequential operations and document bodies from [c174db8](https://github.com/mantou-fw/iconic/blob/c174db8d3ac5ca62ddc923a371c7c262792067fd/src/lib/project-store.ts); conflict handling has separate regression coverage.

The fixture has two image nodes sharing one **1,048,598-byte** source string, plus a text node. The source has a 1 MiB synthetic base64 body and a data-URL prefix; it is never decoded. The sequence creates the project, performs 20 position/text saves and 10 named checkpoints, submits a timestamp-only save, replaces one image, lists versions and restores the initial version. Counts are UTF-8 bytes of `JSON.stringify(document)` submitted through public SDK write calls. They include the application's document envelopes and escaped payload strings, but exclude SDK revision metadata, indexes and physical IndexedDB overhead.

| Operation | Inline application write bytes | Asset-layout application write bytes | New asset writes | SHA-256 calls / input bytes in asset layout |
| --- | ---: | ---: | ---: | ---: |
| Create project and initial version | 4,197,085 | 1,052,113 | 1 | 1 / 1,048,600 |
| 20 position/text saves | 41,970,843 | 31,163 | 0 | 0 / 0 |
| 10 named checkpoints | 41,970,984 | 34,226 | 0 | 0 / 0 |
| Timestamp-only save | 0 | 0 | 0 | 0 / 0 |
| Replace one image | 2,098,544 | 1,050,192 | 1 | 1 / 1,048,600 |
| Restore initial version, with backup | 6,295,679 | 5,338 | 0 | 0 / 0 |

The old layout performs no asset SHA-256 calls. Hashing is a new first-use cost; the warm session avoids repeating it for unchanged sources. The digest input includes JSON quotes, explaining the extra two bytes. These counters do not measure JavaScript string hashing, graph cloning/validation, SDK revision hashing or garbage collection.

For the 11-version list, the inline callback receives 12 complete documents totaling **25,182,640 serialized bytes** before selecting metadata. The new layout makes one indexed metadata query, with no public `getDocument` or full-document enumeration calls. Both return the same **1,688 bytes** of version summaries; this is a change in the work needed to obtain the list, not its result size.

Migrating that v1 fixture after restore retains all **14 original documents** and writes **31 new documents / 4,221,522 application bytes**, hashing its two distinct sources once each. A subsequent position save writes **1,560 bytes** without an asset write or digest call, but performs **three legacy-head guard queries**. Listing its 13 versions performs a metadata query plus **one guard query**. SDK 1.0.3 can materialize the full old head internally for that sequence projection, so migrated projects retain a potentially significant read cost. New projects have no legacy-head guard. The benchmark's public-call counts do not claim to count all SDK-internal reads.

These are serialized write-volume and work-count results for a repeated-image fixture, not browser latency, FPS, physical database size or universal savings. Browser storage performance, quota behavior and desktop interaction require runtime checks beyond the Node tests.

Dependencies are installed with npm and pinned by package-lock.json. The SDK ships under its own Couchbase license (`node_modules/@couchbase/lite-js/LICENSE.txt`); packaging must retain its notices. The application license does not replace dependency licenses. Tests run the real SDK with `fake-indexeddb` on Node; production uses the browser's persistent IndexedDB.

`@couchbase/lite-js` 1.0.3 embeds Dexie 4.2.1 inside its published bundle and enforces a single Dexie version. The legacy reader's direct Dexie dependency is pinned to 4.2.1 as well; upgrade them together and verify the bundle's embedded version. This changes no legacy database name or schema. `npm run build` copies the Couchbase license into `.output/public/licenses/couchbase-lite.txt`, which is included in desktop and web packages.

References: [SDK installation](https://docs.couchbase.com/couchbase-lite-javascript/current/gs-install.html), [databases](https://docs.couchbase.com/couchbase-lite-javascript/current/database.html), [documents and transactions](https://docs.couchbase.com/couchbase-lite-javascript/current/document.html).
