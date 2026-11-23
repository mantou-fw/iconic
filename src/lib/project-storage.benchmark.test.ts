import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { Collection, Database, DocID, meta, type CBLDictionary } from '@couchbase/lite-js';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { blankProject } from './canvas-project';
import { parseProject, type ProjectFile } from './project';
import { ProjectSession, projectDatabaseName, type ProjectEntry, type ProjectVersion } from './project-store';

Database.useIndexedDB(indexedDB, IDBKeyRange);
const closers: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0)) await close();
  for (const entry of await indexedDB.databases()) if (entry.name) await Database.delete(entry.name);
});

const utf8Bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const sourceA = 'data:image/png;base64,' + 'AQID'.repeat(256 * 1024);
const sourceB = 'data:image/png;base64,' + 'BAUG'.repeat(256 * 1024);
const fixtureEntry = (id: string): ProjectEntry => ({ id, name: 'Storage byte fixture', createdAt: '2026-11-23T00:00:00.000Z' });
function fixture(): ProjectFile {
  const project = blankProject();
  project.savedAt = '2026-11-23T00:00:00.000Z';
  project.nodes = [
    { id: 'image-a', type: 'image', position: { x: 0, y: 0 }, data: { src: sourceA } },
    { id: 'image-b', type: 'image', position: { x: 100, y: 50 }, data: { src: sourceA } },
    { id: 'note', type: 'text', position: { x: 0, y: 200 }, data: { text: 'Annotation 00' } },
  ];
  return project;
}

type Session = Pick<ProjectSession, 'entry' | 'save' | 'checkpoint' | 'restore' | 'versions' | 'close'>;
type InlineDoc = {
  kind: 'head' | 'version'; name: string; createdAt: string; updatedAt: string; sequence: number;
  versionNumber: number; label: string; reason: string; sourceVersion: string; payload: string;
};

/**
 * Frozen successful, sequential v1 paths from c174db8d3ac5ca62ddc923a371c7c262792067fd
 * src/lib/project-store.ts. Uses the real SDK, original bodies and sameContent work.
 * Conflict/queue behavior is covered by the main store tests, not this byte fixture.
 * Keep this baseline independent of future changes to ProjectSession.
 */
async function inlineSession(entry: ProjectEntry, project: ProjectFile): Promise<Session> {
  const database = await Database.open<{ documents: InlineDoc }>({ name: projectDatabaseName(entry.id), version: 1, collections: { documents: {} } });
  const collection = database.collections.documents;
  closers.push(() => database.close());
  if (await collection.getDocument(DocID('head'))) throw new Error('Benchmark baseline must start empty.');
  const payload = JSON.stringify(project);
  parseProject(payload);
  const body: InlineDoc = { kind: 'head', name: entry.name, createdAt: entry.createdAt, updatedAt: entry.createdAt,
    sequence: 1, versionNumber: 1, label: '', reason: 'initial', sourceVersion: '', payload };
  await collection.updateMultiple({ save: [
    collection.createDocument(DocID('head'), body),
    collection.createDocument(DocID(crypto.randomUUID()), { ...body, kind: 'version' }),
  ], bestEffort: false });
  const head = async () => (await collection.getDocument(DocID('head')))!;
  const version = (current: InlineDoc, number: number, raw: string, reason: string, label = '', sourceVersion = '') =>
    collection.createDocument(DocID(crypto.randomUUID()), {
      ...current, kind: 'version', versionNumber: number, payload: raw, reason, label, sourceVersion, createdAt: new Date().toISOString(),
    });
  return {
    entry,
    async save(project) {
      const payload = JSON.stringify(project);
      const current = await head();
      const left = JSON.parse(current.payload), right = JSON.parse(payload);
      delete left.savedAt; delete right.savedAt;
      if (JSON.stringify(left) === JSON.stringify(right)) return;
      parseProject(payload);
      current.payload = payload; current.updatedAt = new Date().toISOString(); current.sequence++;
      await collection.save(current);
    },
    async checkpoint(project, label) {
      const payload = JSON.stringify(project);
      const current = await head();
      parseProject(payload);
      const snapshot = version(current, current.versionNumber + 1, payload, 'manual', label.trim());
      current.payload = payload; current.sequence++; current.versionNumber++; current.updatedAt = new Date().toISOString();
      await collection.updateMultiple({ save: [current, snapshot], bestEffort: false });
    },
    async versions() {
      const versions: ProjectVersion[] = [];
      await collection.eachDocument(doc => {
        if (doc.kind === 'version') versions.push({ id: meta(doc).id, number: doc.versionNumber, label: doc.label, createdAt: doc.createdAt, reason: doc.reason as ProjectVersion['reason'], sourceVersion: doc.sourceVersion });
        return true;
      });
      return versions.sort((a, b) => b.number - a.number);
    },
    async restore(versionId, project) {
      const backupPayload = JSON.stringify(project);
      const current = await head();
      const target = (await collection.getDocument(DocID(versionId)))!;
      const restored = { ...parseProject(target.payload), savedAt: new Date().toISOString() };
      const payload = JSON.stringify(restored);
      parseProject(backupPayload);
      const backup = version(current, current.versionNumber + 1, backupPayload, 'before-restore');
      const restoredVersion = version(current, current.versionNumber + 2, payload, 'restore', target.label, versionId);
      current.payload = payload; current.sequence++; current.versionNumber += 2; current.updatedAt = new Date().toISOString();
      await collection.updateMultiple({ save: [current, backup, restoredVersion], bestEffort: false });
      return restored;
    },
    async close() { database.close(); },
  };
}

function counters() {
  return { writeCalls: 0, writtenDocuments: 0, writtenBytes: 0, imageAssetWrites: 0, digestCalls: 0, digestBytes: 0,
    getDocumentCalls: 0, enumeratedDocuments: 0, enumeratedBytes: 0, queries: 0, legacyGuardQueries: 0 };
}

/** Instruments public SDK calls without mocking their storage/query behavior. */
function meter() {
  let counts = counters();
  const recordWrite = (docs: readonly CBLDictionary[]) => {
    counts.writeCalls++;
    for (const doc of docs) {
      counts.writtenDocuments++; counts.writtenBytes += utf8Bytes(doc);
      if (doc.kind === 'image-asset') counts.imageAssetWrites++;
    }
  };
  const save = Collection.prototype.save;
  vi.spyOn(Collection.prototype, 'save').mockImplementation(function (this: Collection, doc, onConflict) {
    recordWrite([doc]); return save.call(this, doc, onConflict);
  });
  const update = Collection.prototype.updateMultiple;
  vi.spyOn(Collection.prototype, 'updateMultiple').mockImplementation(function (this: Collection, args) {
    recordWrite(args.save ?? []); return update.call(this, args);
  });
  const get = Collection.prototype.getDocument;
  vi.spyOn(Collection.prototype, 'getDocument').mockImplementation(function (this: Collection, id) {
    counts.getDocumentCalls++; return get.call(this, id);
  });
  const each = Collection.prototype.eachDocument;
  vi.spyOn(Collection.prototype, 'eachDocument').mockImplementation(function (this: Collection, callback) {
    return each.call(this, doc => {
      counts.enumeratedDocuments++; counts.enumeratedBytes += utf8Bytes(doc); return callback(doc);
    });
  });
  const query = Database.prototype.createQuery;
  vi.spyOn(Database.prototype, 'createQuery').mockImplementation(function (this: Database, sql) {
    counts.queries++;
    if (sql.includes("META().id = 'head'")) counts.legacyGuardQueries++;
    return query.call(this, sql);
  });
  const digest = crypto.subtle.digest;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(function (algorithm, bytes) {
    counts.digestCalls++; counts.digestBytes += bytes.byteLength;
    return digest.call(crypto.subtle, algorithm, bytes);
  });
  return {
    async measure<T>(operation: () => Promise<T>) {
      counts = counters();
      const result = await operation();
      return { result, work: { ...counts } };
    },
  };
}

test('bounds repeated-image write volume and reports real SDK work without latency claims', async () => {
  const measure = meter().measure;
  const scenario = async (create: (project: ProjectFile) => Promise<Session>) => {
    const project = fixture();
    const created = await measure(() => create(project));
    const session = created.result;
    closers.push(() => session.close());
    const moved = await measure(async () => {
      for (let i = 1; i <= 20; i++) {
        project.nodes[0]!.position.x = i;
        project.nodes[2]!.data.text = `Annotation ${String(i).padStart(2, '0')}`;
        await session.save(project);
      }
    });
    const versions = await measure(async () => {
      for (let i = 1; i <= 10; i++) await session.checkpoint(project, `Version ${String(i).padStart(2, '0')}`);
    });
    const unchanged = await measure(() => session.save({ ...project, savedAt: '2030-01-01T00:00:00.000Z' }));
    project.nodes[0]!.data.src = sourceB;
    const replacement = await measure(() => session.save(project));
    const list = await measure(() => session.versions());
    const restored = await measure(() => session.restore(list.result.at(-1)!.id, project));
    return { session, current: restored.result, work: {
      create: created.work, twentyEdits: moved.work, tenVersions: versions.work, timestampOnly: unchanged.work,
      replaceOneImage: replacement.work, versionList: { ...list.work, rows: list.result.length, returnedBytes: utf8Bytes(list.result) },
      restore: restored.work,
    } };
  };
  const before = await scenario(project => inlineSession(fixtureEntry('storage-benchmark-inline'), project));
  const after = await scenario(project => ProjectSession.create(fixtureEntry('storage-benchmark-assets'), project));

  expect(after.work.create.imageAssetWrites).toBe(1);
  expect(after.work.create.digestCalls).toBe(1);
  expect(after.work.create.digestBytes).toBe(utf8Bytes(sourceA));
  for (const key of ['twentyEdits', 'tenVersions', 'restore'] as const) {
    expect(after.work[key].writtenBytes).toBeLessThan(before.work[key].writtenBytes / 100);
    expect(after.work[key].imageAssetWrites).toBe(0);
    expect(after.work[key].digestCalls).toBe(0);
  }
  expect(before.work.timestampOnly.writtenBytes).toBe(0);
  expect(after.work.timestampOnly.writtenBytes).toBe(0);
  expect(after.work.timestampOnly.digestCalls).toBe(0);
  expect(after.work.replaceOneImage.imageAssetWrites).toBe(1);
  expect(after.work.replaceOneImage.digestCalls).toBe(1);
  expect(after.work.replaceOneImage.digestBytes).toBe(utf8Bytes(sourceB));
  expect(after.work.replaceOneImage.writtenBytes).toBeLessThan(before.work.replaceOneImage.writtenBytes * 0.55);
  expect(before.work.versionList.enumeratedDocuments).toBe(12);
  expect(after.work.versionList).toMatchObject({ getDocumentCalls: 0, enumeratedDocuments: 0, queries: 1, legacyGuardQueries: 0, rows: 11 });
  expect(after.work.versionList.returnedBytes).toBeLessThan(4000);

  // Reuse the actual v1 database, with all its original bodies and version IDs.
  await before.session.close();
  const legacy = await Database.open({ name: projectDatabaseName(before.session.entry.id), version: 1, collections: { documents: {} } });
  const originals = new Map<string, string>();
  await legacy.collections.documents!.eachDocument(doc => { originals.set(meta(doc).id, JSON.stringify(doc)); return true; });
  legacy.close();
  const migration = await measure(() => ProjectSession.open(before.session.entry));
  const migrated = migration.result;
  closers.push(() => migrated.close());
  const inspect = await Database.open({ name: projectDatabaseName(before.session.entry.id), version: 2, collections: { documents: { indexes: ['kind'] } } });
  closers.push(() => inspect.close());
  for (const [id, raw] of originals) expect(JSON.stringify(await inspect.collections.documents!.getDocument(DocID(id)))).toBe(raw);
  const current = await migrated.read();
  current.nodes[0]!.position.x = 99;
  const migratedSave = await measure(() => migrated.save(current));
  const migratedList = await measure(() => migrated.versions());
  expect(migration.work.imageAssetWrites).toBe(2);
  expect(migration.work.digestCalls).toBe(2);
  expect(migratedSave.work).toMatchObject({ writtenDocuments: 1, imageAssetWrites: 0, digestCalls: 0, legacyGuardQueries: 3 });
  expect(migratedList.work).toMatchObject({ getDocumentCalls: 0, enumeratedDocuments: 0, queries: 2, legacyGuardQueries: 1 });
  expect(migratedList.result).toHaveLength(13);

  if (process.env.ICONIC_STORAGE_BENCHMARK_REPORT === '1') console.log('PROJECT_STORAGE_BENCHMARK ' + JSON.stringify({
    fixture: { sourceBytes: Buffer.byteLength(sourceA), duplicateImageNodes: 2, editSaves: 20, checkpoints: 10 },
    before: before.work, after: after.work,
    migration: { ...migration.work, unchangedLegacyDocuments: originals.size },
    migratedSave: migratedSave.work, migratedVersionList: { ...migratedList.work, rows: migratedList.result.length, returnedBytes: utf8Bytes(migratedList.result) },
  }));
}, 30_000);
