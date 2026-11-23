import { Database, DocID, meta, ConflictError, MultipleConflictsError, type CBLDocument, type ListenerToken } from '@couchbase/lite-js';
import { parseProject, type ProjectFile } from './project';
import { captureProject, ProjectAssetCodec, type ImageAsset, type StoredProject } from './project-assets';
import type { ProjectArchive } from './project-archive';

export const CATALOG_DATABASE = 'iconic-project-catalog';
export const projectDatabaseName = (id: string) => `iconic-project-${id}`;
export type ProjectEntry = { id: string; name: string; createdAt: string; updatedAt?: string; archived?: true };
export type VersionReason = 'initial' | 'manual' | 'before-restore' | 'restore';
export type ProjectVersion = { id: string; number: number; label: string; createdAt: string; reason: VersionReason; sourceVersion: string };
type CatalogDoc = { entries: string; active: string; migrated: boolean };
type ProjectFields = {
  name: string; createdAt: string; updatedAt: string; sequence: number;
  versionNumber: number; label: string; reason: string; sourceVersion: string;
};
type LegacyDoc = ProjectFields & { kind: 'head' | 'version'; payload: string };
type SnapshotDoc = ProjectFields & StoredProject & { kind: 'asset-head' | 'asset-version'; versionId: string };
type AssetDoc = { kind: 'image-asset'; source: string };
type VersionInfoDoc = {
  kind: 'version-info'; versionId: string; snapshotId: string; versionNumber: number;
  label: string; createdAt: string; reason: VersionReason; sourceVersion: string;
};
type LayoutDoc = { kind: 'asset-layout'; version: 1; migratedFromInline: boolean; legacySequence: number };
type OriginalHeadDoc = { kind: 'original-head'; payload: string };
type StorageDoc = LegacyDoc | SnapshotDoc | AssetDoc | VersionInfoDoc | LayoutDoc | OriginalHeadDoc;
type ProjectDB = Database<{ documents: StorageDoc }>;

const HEAD_ID = 'asset-head-v1';
const LAYOUT_ID = 'asset-layout-v1';
const ORIGINAL_HEAD_ID = 'original-head-v1';
const snapshotId = (id: string) => `asset-snapshot:${id}`;
const versionInfoId = (id: string) => `version-info:${id}`;

function addAssets(target: Map<string, ImageAsset>, assets: ImageAsset[]) {
  for (const asset of assets) {
    if (target.has(asset.id) && target.get(asset.id)!.source !== asset.source) throw new Error('Project data is missing.');
    target.set(asset.id, asset);
  }
}

export class ProjectConflictError extends Error {
  constructor() { super('This project changed in another window. Export your work before reopening the project.'); }
}
export class ProjectLegacyConflictError extends Error {
  constructor() { super('This project was changed by an older version of iconic. Export any open work before reopening iconic to recover both saved copies.'); }
}

/** v2 adds a kind index; the SDK closes existing v1 connections on upgrade. */
async function openDatabase(id: string): Promise<ProjectDB> {
  return Database.open<{ documents: StorageDoc }>({
    name: projectDatabaseName(id), version: 2, collections: { documents: { indexes: ['kind'] } },
  });
}

function metadata(version: SnapshotDoc): VersionInfoDoc {
  return {
    kind: 'version-info', versionId: version.versionId, snapshotId: snapshotId(version.versionId),
    versionNumber: version.versionNumber, label: version.label, createdAt: version.createdAt,
    reason: version.reason as VersionReason, sourceVersion: version.sourceVersion,
  };
}

/** Assets are only inserted, never replaced. They commit with the referencing snapshots. */
async function newAssetDocuments(database: ProjectDB, assets: ImageAsset[], codec: ProjectAssetCodec) {
  const documents: CBLDocument<StorageDoc>[] = [];
  for (const { id, source } of assets) {
    if (codec.isStored({ id, source })) continue;
    const existing = await database.collections.documents.getDocument(DocID(id));
    if (existing) {
      if (existing.kind !== 'image-asset' || existing.source !== source) throw new Error('Project data is missing.');
      codec.markStored({ id, source });
    } else documents.push(database.collections.documents.createDocument(DocID(id), { kind: 'image-asset', source }));
  }
  return documents;
}

/**
 * Build a complete shadow layout, then publish it in one transaction. Original
 * inline documents are never changed, including malformed content used by recovery.
 * Hashing and JSON work happen before the IndexedDB transaction opens.
 */
async function migrateInline(database: ProjectDB, codec: ProjectAssetCodec) {
  const collection = database.collections.documents;
  const ready = await collection.getDocument(DocID(HEAD_ID));
  if (ready?.kind === 'asset-head') return ready;
  const original = await collection.getDocument(DocID('head'));
  if (original?.kind !== 'head') return undefined;

  const writes: CBLDocument<StorageDoc>[] = [];
  const assets = new Map<string, ImageAsset>();
  // IDs do not load image payloads. Process one original at a time so only the
  // compact shadows and unique image sources accumulate during migration.
  for (const id of await collection.documentIDs()) {
    const doc = id === 'head' ? original : await collection.getDocument(id);
    if (!doc || (doc.kind !== 'head' && doc.kind !== 'version')) continue;
    const prepared = await codec.migrate(doc.payload);
    addAssets(assets, prepared.assets);
    const { kind, payload: _payload, ...fields } = doc;
    const body: SnapshotDoc = {
      ...fields, ...prepared.stored,
      kind: kind === 'head' ? 'asset-head' : 'asset-version', versionId: kind === 'head' ? '' : id,
    };
    writes.push(collection.createDocument(DocID(kind === 'head' ? HEAD_ID : snapshotId(id)), body));
    if (kind === 'version') writes.push(collection.createDocument(DocID(versionInfoId(id)), metadata(body)));
  }
  writes.push(...await newAssetDocuments(database, [...assets.values()], codec));
  writes.push(collection.createDocument(DocID(ORIGINAL_HEAD_ID), { kind: 'original-head', payload: original.payload }));
  writes.push(collection.createDocument(DocID(LAYOUT_ID), { kind: 'asset-layout', version: 1, migratedFromInline: true, legacySequence: Number(meta(original).sequence) }));
  try { await collection.updateMultiple({ save: writes, bestEffort: false }); }
  catch (error) {
    // Concurrent first opens must converge on the completely committed winner.
    if (error instanceof MultipleConflictsError) {
      const winner = await collection.getDocument(DocID(HEAD_ID));
      if (winner?.kind === 'asset-head') return winner;
    }
    throw error;
  }
  const head = await collection.getDocument(DocID(HEAD_ID));
  if (head?.kind !== 'asset-head') throw new Error('Project data is missing.');
  return head;
}

/** One open project and its expected revision. A stale editor never overwrites a newer head. */
export class ProjectSession {
  lastEdited: string;
  private pending: Promise<unknown> = Promise.resolve();
  private sequence: number;
  private closed = false;
  private legacyConflict = false;
  private legacyListener?: ListenerToken;
  private constructor(readonly entry: ProjectEntry, private database: ProjectDB, head: ProjectFields, private codec: ProjectAssetCodec, private legacySequence = 0, private migrationError?: unknown) {
    this.lastEdited = head.updatedAt;
    this.sequence = head.sequence;
  }

  private static async attach(entry: ProjectEntry, database: ProjectDB, head: SnapshotDoc, codec: ProjectAssetCodec) {
    const layout = await database.collections.documents.getDocument(DocID(LAYOUT_ID));
    if (layout?.kind !== 'asset-layout' || layout.version !== 1) throw new Error('Project data is missing.');
    const session = new ProjectSession(entry, database, head, codec, layout.legacySequence);
    if (layout.legacySequence) {
      session.legacyListener = database.collections.documents.addDocumentChangeListener(DocID('head'), change => {
        if (Number(change.sequence) !== layout.legacySequence) session.legacyConflict = true;
      });
    }
    try { await session.checkLegacy(); }
    catch (error) {
      if (!(error instanceof ProjectLegacyConflictError)) { session.legacyListener?.remove(); throw error; }
    }
    // Return divergent sessions so the existing recovery UI can export both
    // copies. read() and all mutating operations remain blocked.
    return session;
  }

  private static async recovery(entry: ProjectEntry, database: ProjectDB | undefined, codec: ProjectAssetCodec, cause: unknown) {
    let fallback = database;
    try {
      if (!fallback && await Database.exists(projectDatabaseName(entry.id))) {
        // A failed index/schema upgrade may leave only v1 readable. This lower
        // config is strictly for raw recovery, never for normal reads or writes.
        fallback = await Database.open<{ documents: StorageDoc }>({ name: projectDatabaseName(entry.id), version: 1, collections: { documents: {} } });
      }
      if (fallback) {
        const original = await fallback.collections.documents.getDocument(DocID('head'));
        const current = await fallback.collections.documents.getDocument(DocID(HEAD_ID));
        if (original?.kind === 'head' && !current) return new ProjectSession(entry, fallback, original, codec, 0, cause);
      }
    } catch { /* Keep the migration failure as the actionable error. */ }
    fallback?.close(); codec.clear(); throw cause;
  }

  static async open(entry: ProjectEntry) {
    const codec = new ProjectAssetCodec();
    let database: ProjectDB | undefined;
    try {
      database = await openDatabase(entry.id);
      const head = await migrateInline(database, codec);
      if (!head) throw new Error('Project data is missing.');
      return await this.attach(entry, database, head, codec);
    } catch (error) { return this.recovery(entry, database, codec, error); }
  }

  static async create(entry: ProjectEntry, project: ProjectFile, history?: ProjectArchive["history"]) {
    const captured = captureProject(project);
    const imported = history?.map(({ project, ...version }) => ({ ...version, captured: captureProject(project) }));
    const codec = new ProjectAssetCodec();
    let database: ProjectDB | undefined;
    try {
      database = await openDatabase(entry.id);
      const collection = database.collections.documents;
      const existing = await migrateInline(database, codec);
      // A deterministic migration ID allows recovery after a catalog write failed.
      if (existing) return await this.attach(entry, database, existing, codec);
      const { stored, assets } = await codec.prepare(captured);
      const combined = new Map<string, ImageAsset>();
      addAssets(combined, assets);
      const versionNumber = imported?.reduce((latest, item) => Math.max(latest, item.number), 1) ?? 1;
      const body: SnapshotDoc = {
        kind: 'asset-head', name: entry.name, createdAt: entry.createdAt, updatedAt: entry.createdAt,
        sequence: 1, versionNumber, label: '', reason: 'initial', sourceVersion: '', versionId: '', ...stored,
      };
      const snapshots: SnapshotDoc[] = [];
      if (imported?.length) {
        for (const item of imported) {
          const prepared = await codec.prepare(item.captured);
          addAssets(combined, prepared.assets);
          snapshots.push({ ...body, ...prepared.stored, kind: 'asset-version', versionId: item.id, versionNumber: item.number,
            label: item.label, reason: item.reason, sourceVersion: item.sourceVersion, createdAt: item.createdAt });
        }
      } else snapshots.push({ ...body, kind: 'asset-version', versionId: crypto.randomUUID() });
      const uniqueAssets = [...combined.values()];
      const save = [
        collection.createDocument(DocID(HEAD_ID), body),
        ...snapshots.flatMap(snapshot => [
          collection.createDocument(DocID(snapshotId(snapshot.versionId)), snapshot),
          collection.createDocument(DocID(versionInfoId(snapshot.versionId)), metadata(snapshot)),
        ]),
        collection.createDocument(DocID(LAYOUT_ID), { kind: 'asset-layout', version: 1, migratedFromInline: false, legacySequence: 0 }),
        ...await newAssetDocuments(database, uniqueAssets, codec),
      ];
      await collection.updateMultiple({ save, bestEffort: false });
      const session = new ProjectSession(entry, database, body, codec);
      uniqueAssets.forEach(asset => codec.markStored(asset));
      return session;
    } catch (error) {
      // Two initial tabs can race to copy the same legacy database. Only the
      // winning initial transaction is retained; the other opens that copy.
      if (error instanceof MultipleConflictsError && database) {
        const head = await database.collections.documents.getDocument(DocID(HEAD_ID));
        if (head?.kind === 'asset-head') return await this.attach(entry, database, head, codec);
      }
      return this.recovery(entry, database, codec, error);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(() => {
      if (this.closed) throw new Error('Project is closed.');
      return operation();
    }).catch(error => {
      if (error instanceof ConflictError || error instanceof MultipleConflictsError) throw new ProjectConflictError();
      throw error;
    });
    this.pending = next.catch(() => undefined);
    return next;
  }

  private async checkLegacy() {
    if (this.migrationError) throw this.migrationError;
    if (!this.legacySequence) return;
    if (!this.legacyConflict) {
      // Public SQL++ projection: no application-level image JSON decoding or
      // legacy rewrite. SDK 1.0.3 still materializes this original row internally.
      // A schema upgrade closes old tabs, but Dexie allows a subsequently
      // reopened older app, so the database version alone is not a write fence.
      const rows = await this.database.createQuery("SELECT META().sequence AS sequence FROM documents WHERE META().id = 'head'").execute<{ sequence: number }>();
      this.legacyConflict = rows[0]?.sequence !== this.legacySequence;
    }
    if (this.legacyConflict) throw new ProjectLegacyConflictError();
  }

  private async head(checkLegacy = true) {
    if (this.migrationError) throw this.migrationError;
    if (checkLegacy) await this.checkLegacy();
    const head = await this.database.collections.documents.getDocument(DocID(HEAD_ID));
    if (head?.kind !== 'asset-head') throw new Error('Project data is missing.');
    if (head.sequence !== this.sequence) throw new ProjectConflictError();
    return head;
  }

  private portable(snapshot: StoredProject) {
    return this.codec.hydrate(snapshot, async id => {
      const asset = await this.database.collections.documents.getDocument(DocID(id));
      if (asset?.kind !== 'image-asset') throw new Error('Project data is missing.');
      if (await this.codec.identify(asset.source) !== id) throw new Error('Project data is missing.');
      this.codec.markStored({ id, source: asset.source });
      return asset.source;
    });
  }

  /** Fully portable JSON; internal asset IDs never escape through recovery/export. */
  readRaw(): Promise<string> {
    return this.enqueue(async () => {
      if (this.migrationError) {
        const original = await this.database.collections.documents.getDocument(DocID('head'));
        if (original?.kind !== 'head') throw new Error('Project data is missing.');
        return original.payload;
      }
      return this.portable(await this.head(false));
    });
  }

  read(): Promise<ProjectFile> {
    return this.enqueue(async () => parseProject(await this.portable(await this.head())));
  }

  /** Available alongside readRaw() when an older app has edited the legacy head. */
  readLegacyEditsRaw(): Promise<string | undefined> {
    return this.enqueue(async () => {
      if (!this.legacyConflict) return undefined;
      const original = await this.database.collections.documents.getDocument(DocID('head'));
      return original?.kind === 'head' ? original.payload : undefined;
    });
  }

  /** Read the exact pre-migration payload without replacing current work. */
  readMigrationBackup(versionId?: string): Promise<string | undefined> {
    return this.enqueue(async () => {
      if (!versionId) {
        const backup = await this.database.collections.documents.getDocument(DocID(ORIGINAL_HEAD_ID));
        if (backup?.kind === 'original-head') return backup.payload;
      }
      const original = await this.database.collections.documents.getDocument(DocID(versionId ?? 'head'));
      return original?.kind === (versionId ? 'version' : 'head') ? original.payload : undefined;
    });
  }

  save(project: ProjectFile): Promise<void> {
    const captured = captureProject(project); // Capture before queued work or hashing runs.
    return this.enqueue(async () => {
      const { stored, assets } = await this.codec.prepare(captured);
      const head = await this.head();
      const assetWrites = await newAssetDocuments(this.database, assets, this.codec);
      if (head.encoding === stored.encoding && head.payload === stored.payload) return;
      Object.assign(head, stored);
      head.updatedAt = new Date().toISOString();
      head.sequence++;
      await this.checkLegacy();
      await this.database.collections.documents.updateMultiple({ save: [head, ...assetWrites], bestEffort: false });
      this.sequence = head.sequence;
      this.lastEdited = head.updatedAt;
      assets.forEach(asset => this.codec.markStored(asset));
      await this.checkLegacy();
    });
  }

  versions(): Promise<ProjectVersion[]> {
    return this.enqueue(async () => {
      await this.checkLegacy();
      return this.versionMetadata();
    });
  }

  private versionMetadata() {
    return this.database.createQuery(
      "SELECT versionId AS id, versionNumber AS number, label, createdAt, reason, sourceVersion FROM documents WHERE kind = 'version-info' ORDER BY versionNumber DESC",
    ).execute<ProjectVersion>();
  }

  private async versionProject(versionId: string): Promise<ProjectFile> {
    const target = await this.database.collections.documents.getDocument(DocID(snapshotId(versionId)));
    if (target?.kind !== 'asset-version') throw new Error('Version not found.');
    return parseProject(await this.portable(target));
  }

  readVersion(versionId: string): Promise<ProjectFile> {
    return this.enqueue(async () => {
      await this.checkLegacy();
      return this.versionProject(versionId);
    });
  }

  exportArchive(current: ProjectFile): Promise<ProjectArchive> {
    const captured = structuredClone(current);
    return this.enqueue(async () => {
      const head = await this.head();
      const history: ProjectArchive["history"] = [];
      for (const entry of await this.versionMetadata()) {
        history.push({ ...entry, project: await this.versionProject(entry.id) });
      }
      // Abort if another editor checkpointed or changed the project while reading.
      if ((await this.head()).sequence !== head.sequence) throw new ProjectConflictError();
      return { kind: 'iconic-project-archive', version: 1, name: this.entry.name, current: captured, history };
    });
  }

  removeVersions(ids: string[]): Promise<void> {
    const selected = new Set(ids);
    return this.enqueue(async () => {
      if (!selected.size) return;
      const head = await this.head();
      const versions = await this.versionMetadata();
      if (versions.every(version => selected.has(version.id))) throw new Error('Keep at least one project version.');
      const collection = this.database.collections.documents;
      const removed: CBLDocument<StorageDoc>[] = [];
      for (const id of selected) {
        const snapshot = await collection.getDocument(DocID(snapshotId(id)));
        const info = await collection.getDocument(DocID(versionInfoId(id)));
        if (snapshot?.kind !== 'asset-version' || info?.kind !== 'version-info') throw new Error('Version not found.');
        removed.push(snapshot, info);
      }
      head.sequence++;
      await this.checkLegacy();
      await collection.updateMultiple({ save: [head], delete: removed, bestEffort: false });
      this.sequence = head.sequence;
      await this.checkLegacy();
    });
  }

  private version(head: SnapshotDoc, number: number, stored: StoredProject, reason: VersionReason, label = '', sourceVersion = '') {
    const versionId = crypto.randomUUID();
    const body: SnapshotDoc = {
      ...head, ...stored, kind: 'asset-version', versionId, versionNumber: number, reason, label, sourceVersion, createdAt: new Date().toISOString(),
    };
    const collection = this.database.collections.documents;
    return [
      collection.createDocument(DocID(snapshotId(versionId)), body),
      collection.createDocument(DocID(versionInfoId(versionId)), metadata(body)),
    ];
  }

  checkpoint(project: ProjectFile, label: string): Promise<void> {
    if (!label.trim() || label.trim().length > 200) return Promise.reject(new Error('Enter a version name (1–200 characters).'));
    const captured = captureProject(project);
    return this.enqueue(async () => {
      const { stored, assets } = await this.codec.prepare(captured);
      const head = await this.head();
      const versions = this.version(head, head.versionNumber + 1, stored, 'manual', label.trim());
      const assetWrites = await newAssetDocuments(this.database, assets, this.codec);
      Object.assign(head, stored);
      head.sequence++;
      head.versionNumber++;
      head.updatedAt = new Date().toISOString();
      await this.checkLegacy();
      await this.database.collections.documents.updateMultiple({ save: [head, ...versions, ...assetWrites], bestEffort: false });
      this.sequence = head.sequence;
      this.lastEdited = head.updatedAt;
      assets.forEach(asset => this.codec.markStored(asset));
      await this.checkLegacy();
    });
  }

  restore(versionId: string, current: ProjectFile): Promise<ProjectFile> {
    const captured = captureProject(current);
    return this.enqueue(async () => {
      const collection = this.database.collections.documents;
      const head = await this.head();
      const target = await collection.getDocument(DocID(snapshotId(versionId)));
      if (target?.kind !== 'asset-version') throw new Error('Version not found.');
      const restored = { ...parseProject(await this.portable(target)), savedAt: new Date().toISOString() };
      const backup = await this.codec.prepare(captured);
      const prepared = await this.codec.prepare(captureProject(restored));
      const combined = new Map<string, ImageAsset>();
      addAssets(combined, backup.assets); addAssets(combined, prepared.assets);
      const assets = [...combined.values()];
      const assetWrites = await newAssetDocuments(this.database, assets, this.codec);
      const versions = [
        ...this.version(head, head.versionNumber + 1, backup.stored, 'before-restore'),
        ...this.version(head, head.versionNumber + 2, prepared.stored, 'restore', target.label, versionId),
      ];
      Object.assign(head, prepared.stored);
      head.sequence++;
      head.versionNumber += 2;
      head.updatedAt = new Date().toISOString();
      await this.checkLegacy();
      await collection.updateMultiple({ save: [head, ...versions, ...assetWrites], bestEffort: false });
      this.sequence = head.sequence;
      this.lastEdited = head.updatedAt;
      assets.forEach(asset => this.codec.markStored(asset));
      await this.checkLegacy();
      return restored;
    });
  }

  async close() { await this.pending; this.closed = true; this.legacyListener?.remove(); this.codec.clear(); this.database.close(); }
}

export class ProjectCatalog {
  private constructor(private database: Database<{ catalog: CatalogDoc }>) {}
  static async open() {
    return new ProjectCatalog(await Database.open<{ catalog: CatalogDoc }>({ name: CATALOG_DATABASE, version: 1, collections: { catalog: {} } }));
  }
  private async state() {
    return await this.database.collections.catalog.getDocument(DocID('state')) ?? this.database.collections.catalog.createDocument(DocID('state'), { entries: '[]', active: '', migrated: false });
  }
  private async change(update: (doc: CBLDocument<CatalogDoc>) => void) {
    // Catalog operations merge concurrent project additions; drawing conflicts do not.
    for (let attempt = 0; ; attempt++) {
      const doc = await this.state();
      update(doc);
      try { await this.database.collections.catalog.save(doc); return; }
      catch (error) {
        if (!(error instanceof ConflictError) || attempt >= 4) throw error;
      }
    }
  }
  async list(): Promise<ProjectEntry[]> { return JSON.parse((await this.state()).entries); }
  async activeId() { return (await this.state()).active; }
  async activate(id: string) {
    await this.change(doc => {
      if (!(JSON.parse(doc.entries) as ProjectEntry[]).some(entry => entry.id === id && !entry.archived)) throw new Error('Project not found.');
      doc.active = id;
    });
  }
  private async editEntry(id: string, edit: (entry: ProjectEntry, document: CBLDocument<CatalogDoc>) => void) {
    let entry: ProjectEntry | undefined;
    await this.change(doc => {
      const entries: ProjectEntry[] = JSON.parse(doc.entries);
      entry = entries.find(item => item.id === id);
      if (!entry) throw new Error('Project not found.');
      edit(entry, doc);
      doc.entries = JSON.stringify(entries);
    });
    return entry!;
  }
  rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200) throw new Error('Enter a project name (1–200 characters).');
    return this.editEntry(id, entry => { entry.name = trimmed; });
  }
  setArchived(id: string, archived: boolean) {
    return this.editEntry(id, (entry, doc) => {
      if (archived) {
        entry.archived = true;
        if (doc.active === id) doc.active = '';
      } else delete entry.archived;
    });
  }
  markEdited(id: string, updatedAt: string) {
    return this.editEntry(id, entry => {
      if ((entry.updatedAt ?? entry.createdAt) < updatedAt) entry.updatedAt = updatedAt;
    });
  }
  private async register(entry: ProjectEntry, migrated = false) {
    await this.change(doc => {
      const entries: ProjectEntry[] = JSON.parse(doc.entries);
      if (!entries.some(item => item.id === entry.id)) entries.push(entry);
      doc.entries = JSON.stringify(entries);
      doc.active = entry.id;
      if (migrated) doc.migrated = true;
    });
  }
  async create(name: string, project: ProjectFile, history?: ProjectArchive["history"]) {
    if (!name.trim() || name.trim().length > 200) throw new Error('Enter a project name (1–200 characters).');
    const entry: ProjectEntry = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() };
    const session = await ProjectSession.create(entry, project, history);
    try { await this.register(entry); return session; }
    catch (error) { await session.close(); throw error; }
  }
  importArchive(archive: ProjectArchive) { return this.create(archive.name, archive.current, archive.history); }
  async initialize(readLegacy: () => Promise<ProjectFile>, legacyName: string) {
    const state = await this.state();
    if (!state.migrated && !state.active) {
      const entry: ProjectEntry = { id: 'legacy-import', name: legacyName, createdAt: new Date().toISOString() };
      const session = await ProjectSession.create(entry, await readLegacy());
      try { await this.register(entry, true); return session; }
      catch (error) { await session.close(); throw error; }
    }
    const entries = await this.list();
    const available = entries.filter(item => !item.archived);
    const entry = available.find(item => item.id === state.active) ?? available[0];
    if (!entry) throw new Error('Project catalog is empty.');
    return ProjectSession.open(entry);
  }
  close() { this.database.close(); }
}
