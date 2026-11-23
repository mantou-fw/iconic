import 'fake-indexeddb/auto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Collection, Database, DocID, meta, type CBLDictionary } from '@couchbase/lite-js';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { ProjectSession, projectDatabaseName, ProjectConflictError, ProjectLegacyConflictError, type ProjectEntry } from './project-store';
import { blankProject } from './canvas-project';
import { parseProject, type ProjectFile } from './project';
import { ASSET_PREFIX, ProjectAssetCodec } from './project-assets';

Database.useIndexedDB(indexedDB, IDBKeyRange);
const sessions: ProjectSession[] = [];
const databases: Database[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(sessions.splice(0).map(session => session.close()));
  databases.splice(0).forEach(database => database.close());
  for (const entry of await indexedDB.databases()) if (entry.name) await Database.delete(entry.name);
});

const imageA = 'data:image/png;base64,AQID';
const imageB = 'data:image/png;base64,BAUG';
const entry = (): ProjectEntry => ({ id: crypto.randomUUID(), name: 'Asset fixture', createdAt: '2026-11-23T00:00:00.000Z' });
function imageProject(source = imageA): ProjectFile {
  const project = blankProject();
  project.nodes = [
    { id: 'image-a', type: 'image', position: { x: 0, y: 0 }, data: { src: source } },
    { id: 'image-b', type: 'image', position: { x: 100, y: 50 }, data: { src: source } },
    { id: 'note', type: 'text', position: { x: 0, y: 200 }, data: { text: 'Drawing A' } },
  ];
  return project;
}
async function create(project = imageProject()) {
  const session = await ProjectSession.create(entry(), project);
  sessions.push(session);
  return session;
}
async function inspect(project: ProjectEntry) {
  const database = await Database.open({ name: projectDatabaseName(project.id), version: 2, collections: { documents: { indexes: ['kind'] } } });
  databases.push(database);
  return database;
}
async function records(database: Database) {
  const result: { id: string; body: CBLDictionary; revision: string | undefined }[] = [];
  await database.collections.documents!.eachDocument(doc => {
    result.push({ id: meta(doc).id, body: JSON.parse(JSON.stringify(doc)), revision: meta(doc).revisionID });
    return true;
  });
  return result;
}

/** Exact pre-assets schema, including full payloads and pre-existing version IDs. */
async function legacyFixture(headRaw?: string) {
  const project = entry();
  const database = await Database.open({ name: projectDatabaseName(project.id), version: 1, collections: { documents: {} } });
  const first = imageProject(imageA);
  first.savedAt = '2026-10-27T00:00:00.000Z';
  const second = imageProject(imageB);
  second.savedAt = '2026-10-28T00:00:00.000Z';
  const base = { name: project.name, createdAt: project.createdAt, updatedAt: project.createdAt, sequence: 7, versionNumber: 2, label: '', reason: 'initial', sourceVersion: '' };
  const originals = new Map([
    ['head', { ...base, kind: 'head', payload: headRaw ?? JSON.stringify(second, null, 2) }],
    ['legacy-v1', { ...base, kind: 'version', versionNumber: 1, payload: JSON.stringify(first, null, 2) }],
    ['legacy-v2', { ...base, kind: 'version', reason: 'manual', label: 'Reviewed plan', payload: JSON.stringify(second, null, 2) }],
  ]);
  await database.collections.documents!.updateMultiple({ save: [...originals].map(([id, body]) => database.collections.documents!.createDocument(DocID(id), body)), bestEffort: false });
  database.close();
  return { project, originals, first, second };
}

describe('asset-backed project storage with the real Couchbase SDK', () => {
  test('asset extraction preserves validation of the original source and savedAt fields', async () => {
    for (const source of ['', '   ']) {
      await expect(ProjectSession.create(entry(), imageProject(source))).rejects.toThrow(/nodes\[0\].data.src/);
    }
    await expect(ProjectSession.create(entry(), { ...imageProject(), savedAt: 123 } as unknown as ProjectFile)).rejects.toThrow(/savedAt/);
  });

  test('distinct lone UTF-16 surrogates remain distinct sources through hashing and round trips', async () => {
    const project = imageProject('images/\ud800.png');
    project.nodes[1]!.data.src = 'images/\ud801.png';
    const session = await create(project);
    expect(await session.read()).toEqual(project);
    const database = await inspect(session.entry);
    expect((await records(database)).filter(doc => doc.body.kind === 'image-asset')).toHaveLength(2);
  });

  test('a duplicate digest with differing sources is rejected both within a batch and after caching', async () => {
    const identify = vi.spyOn(ProjectAssetCodec.prototype, 'identify').mockResolvedValue(ASSET_PREFIX + '0'.repeat(64));
    const duplicate = imageProject(imageA); duplicate.nodes[1]!.data.src = imageB;
    await expect(create(duplicate)).rejects.toThrow('Project data is missing.');
    const session = await create(imageProject(imageA));
    const database = await inspect(session.entry);
    const before = await records(database);
    await expect(session.save(imageProject(imageB))).rejects.toThrow('Project data is missing.');
    await expect(session.checkpoint(imageProject(imageB), 'Collision')).rejects.toThrow('Project data is missing.');
    const target = (await session.versions())[0]!;
    await expect(session.restore(target.id, imageProject(imageB))).rejects.toThrow('Project data is missing.');
    expect(await records(database)).toEqual(before);

    // Colliding sources in separate legacy versions must not be deduplicated
    // into a lossy migration, even when each individual version is valid.
    const fixture = await legacyFixture();
    const recovery = await ProjectSession.open(fixture.project); sessions.push(recovery);
    await expect(recovery.read()).rejects.toThrow('Project data is missing.');
    expect(await recovery.readRaw()).toBe(fixture.originals.get('head')!.payload);
    const legacy = await inspect(fixture.project);
    expect((await records(legacy)).map(doc => [doc.id, doc.body])).toEqual([...fixture.originals]);
    identify.mockRestore();
  });

  test('shares immutable images across nodes, autosaves and versions without rewriting unchanged assets', async () => {
    const original = imageProject();
    const session = await create(original);
    const database = await inspect(session.entry);
    const initialAsset = (await records(database)).find(doc => doc.body.kind === 'image-asset')!;
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const writes = vi.spyOn(Collection.prototype, 'updateMultiple');

    const moved = structuredClone(original);
    moved.nodes[0]!.position.x = 25;
    moved.nodes[2]!.data.text = 'Changed annotation';
    await session.save(moved);
    await session.checkpoint(moved, 'Moved image');
    await session.checkpoint(moved, 'Reviewed image');
    await session.save({ ...moved, savedAt: '2030-01-01T00:00:00.000Z' });

    expect(digest).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledTimes(3); // timestamp-only save performs no write
    expect(writes.mock.calls.flatMap(([args]) => args.save ?? []).some(doc => doc.kind === 'image-asset')).toBe(false);
    const stored = await records(database);
    expect(stored.filter(doc => doc.body.kind === 'image-asset')).toEqual([initialAsset]);
    const snapshots = stored.filter(doc => ['asset-head', 'asset-version'].includes(String(doc.body.kind)));
    expect(snapshots).toHaveLength(4);
    expect(snapshots.every(doc => String(doc.body.payload).includes(ASSET_PREFIX))).toBe(true);
    expect(snapshots.every(doc => !String(doc.body.payload).includes(imageA))).toBe(true);
    expect(await session.read()).toEqual(moved);
  });

  test('captures image and non-image edits at submission before asynchronous hashing', async () => {
    const session = await create();
    const next = imageProject(imageB);
    const saving = session.save(next);
    next.nodes[0]!.data.src = 'data:image/png;base64,changed-after-call';
    next.nodes[2]!.data.text = 'Changed after submission';
    await saving;
    const saved = await session.read();
    expect(saved.nodes[0]!.data.src).toBe(imageB);
    expect(saved.nodes[2]!.data.text).toBe('Drawing A');
  });

  test('reads version metadata through its index without enumerating snapshots or assets', async () => {
    const session = await create(imageProject('data:image/png;base64,' + 'AQID'.repeat(256 * 1024)));
    await session.checkpoint(await session.read(), 'Large image');
    const each = vi.spyOn(Collection.prototype, 'eachDocument').mockImplementation(() => { throw new Error('Do not enumerate full documents for the version list'); });
    const get = vi.spyOn(Collection.prototype, 'getDocument');
    const plans: string[] = [];
    const createQuery = Database.prototype.createQuery;
    vi.spyOn(Database.prototype, 'createQuery').mockImplementation(function (this: Database, sql) {
      const query = createQuery.call(this, sql);
      plans.push(query.explanation);
      return query;
    });
    const versions = await session.versions();
    expect(versions.map(version => version.number)).toEqual([2, 1]);
    expect(versions.every(version => Object.keys(version).sort().join(',') === 'createdAt,id,label,number,reason,sourceVersion')).toBe(true);
    expect(each).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatch(/index.*kind|kind.*index/i);
    expect(JSON.stringify(versions).length).toBeLessThan(1000);
  });

  test('exports self-contained JSON that survives importing into an independent project', async () => {
    const original = await create();
    const raw = await original.readRaw();
    expect(raw).toContain(imageA);
    expect(raw).not.toContain(ASSET_PREFIX);
    const imported = await create(parseProject(raw));
    await original.close();
    await Database.delete(projectDatabaseName(original.entry.id));
    expect(await imported.read()).toEqual(parseProject(raw));
    await imported.checkpoint(await imported.read(), 'Independent');
    const restored = await imported.restore((await imported.versions()).at(-1)!.id, imageProject(imageB));
    expect(restored.nodes[0]!.data.src).toBe(imageA);
  });

  test('migrates a complete v1 layout, retains exact originals, and restores old version IDs', async () => {
    const fixture = await legacyFixture();
    const session = await ProjectSession.open(fixture.project); sessions.push(session);
    const database = await inspect(fixture.project);
    const stored = await records(database);
    for (const [id, body] of fixture.originals) expect(stored.find(doc => doc.id === id)?.body).toEqual(body);
    expect(stored.filter(doc => doc.body.kind === 'image-asset')).toHaveLength(2);
    expect(await session.read()).toEqual(fixture.second);
    expect(await session.readMigrationBackup()).toBe(fixture.originals.get('head')!.payload);
    expect(await session.readMigrationBackup('legacy-v1')).toBe(fixture.originals.get('legacy-v1')!.payload);
    expect((await session.versions()).map(version => [version.id, version.number])).toEqual([['legacy-v2', 2], ['legacy-v1', 1]]);

    const restored = await session.restore('legacy-v1', await session.read());
    expect(restored.nodes[0]!.data.src).toBe(imageA);
    expect((await session.versions())[0]!.sourceVersion).toBe('legacy-v1');
    for (const [id, body] of fixture.originals) expect((await records(database)).find(doc => doc.id === id)?.body).toEqual(body);
    await session.close();
    const reopened = await ProjectSession.open(fixture.project); sessions.push(reopened);
    expect(await reopened.read()).toEqual(restored);
    expect(await reopened.versions()).toHaveLength(4);
  });

  test('retains malformed v1 payloads verbatim for recovery while migrating intact versions', async () => {
    const raw = '{ "kind":"av-schematic", "version":1, "nodes":[null], "edges":[] }';
    const fixture = await legacyFixture(raw);
    const session = await ProjectSession.open(fixture.project); sessions.push(session);
    await expect(session.read()).rejects.toThrow(/nodes\[0\]/);
    expect(await session.readRaw()).toBe(raw);
    expect(await session.readMigrationBackup()).toBe(raw);
    const recovered = await session.restore('legacy-v1', blankProject());
    expect(recovered.nodes[0]!.data.src).toBe(imageA);
    expect(await session.readMigrationBackup()).toBe(raw);
  });

  test('an actual SDK migration conflict rolls back every shadow and asset, then retry succeeds', async () => {
    const fixture = await legacyFixture();
    const database = await inspect(fixture.project);
    const collection = database.collections.documents!;
    // Occupy a future metadata ID: the conflict occurs inside updateMultiple,
    // after it has attempted other writes, rather than mocking the transaction.
    await collection.save(collection.createDocument(DocID('version-info:legacy-v2'), { kind: 'test-conflict' }));
    const before = await records(database);
    const recovery = await ProjectSession.open(fixture.project); sessions.push(recovery);
    await expect(recovery.read()).rejects.toThrow();
    expect(recovery.entry.name).toBe(fixture.project.name);
    expect(await recovery.readRaw()).toBe(fixture.originals.get('head')!.payload);
    expect(await recovery.readMigrationBackup()).toBe(fixture.originals.get('head')!.payload);
    await expect(recovery.save(imageProject())).rejects.toThrow();
    await expect(recovery.checkpoint(imageProject(), 'Blocked')).rejects.toThrow();
    await expect(recovery.restore('legacy-v1', imageProject())).rejects.toThrow();
    await expect(recovery.versions()).rejects.toThrow();
    expect(await records(database)).toEqual(before);
    expect((await records(database)).some(doc => doc.body.kind === 'asset-head' || doc.body.kind === 'image-asset')).toBe(false);
    await collection.purge(DocID('version-info:legacy-v2')); // test fixture only
    const another = await create();
    expect((await another.read()).nodes[0]!.data.src).toBe(imageA);
    await recovery.close();
    const retried = await ProjectSession.open(fixture.project); sessions.push(retried);
    expect(await retried.read()).toEqual(fixture.second);
    expect(await retried.versions()).toHaveLength(2);
    expect((await records(database)).filter(doc => doc.body.kind === 'image-asset')).toHaveLength(2);
  });

  test.each(['open', 'create'] as const)('a failed schema upgrade during %s leaves an exportable read-only v1 recovery session', async method => {
    const fixture = await legacyFixture();
    const open = Database.open;
    vi.spyOn(Database, 'open').mockImplementationOnce(async () => { throw new DOMException('Disk full during index upgrade', 'QuotaExceededError'); });
    // create() is also used when retrying a deterministic legacy import after
    // its catalog write failed. Its existing v1 copy must remain recoverable.
    const recovery = await (method === 'open' ? ProjectSession.open(fixture.project) : ProjectSession.create(fixture.project, blankProject())); sessions.push(recovery);
    await expect(recovery.read()).rejects.toThrow('Disk full during index upgrade');
    expect(await recovery.readRaw()).toBe(fixture.originals.get('head')!.payload);
    await expect(recovery.save(imageProject())).rejects.toThrow('Disk full during index upgrade');
    await expect(recovery.checkpoint(imageProject(), 'Blocked')).rejects.toThrow('Disk full during index upgrade');
    await expect(recovery.restore('legacy-v1', imageProject())).rejects.toThrow('Disk full during index upgrade');
    await expect(recovery.versions()).rejects.toThrow('Disk full during index upgrade');
    expect((await indexedDB.databases()).find(item => item.name === projectDatabaseName(fixture.project.id))!.version).toBe(10);
    await recovery.close();
    vi.mocked(Database.open).mockRestore();
    expect(Database.open).toBe(open);
    const retry = await ProjectSession.open(fixture.project); sessions.push(retry);
    expect(await retry.read()).toEqual(fixture.second);
  });

  test('reopened older clients cannot silently diverge from an already open or reopened new editor', async () => {
    const fixture = await legacyFixture();
    const current = await ProjectSession.open(fixture.project); sessions.push(current);
    const currentProject = imageProject('data:image/png;base64,new-editor');
    await current.save(currentProject);
    const database = await inspect(fixture.project);
    const before = await records(database);
    // This is an actual lower-schema SDK reopen, not a simulated notification.
    const old = await Database.open({ name: projectDatabaseName(fixture.project.id), version: 1, collections: { documents: {} } });
    const oldHead = (await old.collections.documents!.getDocument(DocID('head')))!;
    const olderProject = imageProject('data:image/png;base64,older-editor');
    const olderRaw = JSON.stringify(olderProject, null, 2);
    oldHead.payload = olderRaw;
    oldHead.sequence = Number(oldHead.sequence) + 1;
    await old.collections.documents!.save(oldHead);
    old.close();

    await expect(current.read()).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    await expect(current.save(imageProject())).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    await expect(current.checkpoint(imageProject(), 'Blocked')).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    await expect(current.restore('legacy-v1', imageProject())).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    expect(parseProject(await current.readRaw())).toEqual(currentProject);
    expect(await current.readLegacyEditsRaw()).toBe(olderRaw);
    expect(await current.readMigrationBackup()).toBe(fixture.originals.get('head')!.payload);
    expect((await records(database)).filter(doc => doc.id !== 'head')).toEqual(before.filter(doc => doc.id !== 'head'));
    await current.close();

    // Mirrors workspace startup: open gives it a session; read fails; the catch
    // handler can export both copies without changing the active project.
    const recovery = await ProjectSession.open(fixture.project); sessions.push(recovery);
    await expect(recovery.read()).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    const currentRaw = await recovery.readRaw();
    expect(parseProject(currentRaw)).toEqual(currentProject);
    expect(await recovery.readLegacyEditsRaw()).toBe(olderRaw);
    const chosen = await create(parseProject(olderRaw));
    expect(await chosen.read()).toEqual(olderProject);
  });

  test('concurrent v1 migrations converge on one complete layout and preserve stale-editor protection', async () => {
    const fixture = await legacyFixture();
    const opened = await Promise.all([ProjectSession.open(fixture.project), ProjectSession.open(fixture.project)]);
    sessions.push(...opened);
    const [a, b] = opened as [ProjectSession, ProjectSession];
    const changed = imageProject('data:image/png;base64,new-image');
    await a.save(changed);
    await expect(b.save(imageProject('data:image/png;base64,stale-image'))).rejects.toBeInstanceOf(ProjectConflictError);
    const database = await inspect(fixture.project);
    const stored = await records(database);
    expect(stored.filter(doc => doc.body.kind === 'asset-layout')).toHaveLength(1);
    expect(stored.filter(doc => doc.body.kind === 'version-info')).toHaveLength(2);
    expect(stored.some(doc => doc.body.source === 'data:image/png;base64,stale-image')).toBe(false);
    expect(await a.read()).toEqual(changed);
  });

  test('an older writer racing migration retains the captured baseline and both recoverable histories', async () => {
    const fixture = await legacyFixture();
    // Upgrade first so the independently reopened old client survives the test.
    await inspect(fixture.project);
    const old = await Database.open({ name: projectDatabaseName(fixture.project.id), version: 1, collections: { documents: {} } });
    databases.push(old);
    const oldHead = (await old.collections.documents!.getDocument(DocID('head')))!;
    const olderRaw = JSON.stringify(imageProject('images/older-during-migration.png'), null, 2);
    const update = Collection.prototype.updateMultiple;
    let raced = false;
    vi.spyOn(Collection.prototype, 'updateMultiple').mockImplementation(async function (this: Collection, args) {
      if (!raced && args.save?.some(doc => doc.kind === 'asset-layout')) {
        raced = true;
        oldHead.payload = olderRaw;
        oldHead.sequence = Number(oldHead.sequence) + 1;
        await old.collections.documents!.save(oldHead);
        await old.collections.documents!.save(old.collections.documents!.createDocument(DocID('older-added-version'), { ...oldHead, kind: 'version' }));
      }
      return update.call(this, args);
    });
    const recovery = await ProjectSession.open(fixture.project); sessions.push(recovery);
    expect(raced).toBe(true);
    await expect(recovery.read()).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    expect(parseProject(await recovery.readRaw())).toEqual(fixture.second);
    expect(await recovery.readLegacyEditsRaw()).toBe(olderRaw);
    expect(await recovery.readMigrationBackup()).toBe(fixture.originals.get('head')!.payload);
    expect(await recovery.readMigrationBackup('older-added-version')).toBe(olderRaw);
  });

  test.each(['save', 'checkpoint', 'restore'] as const)('an older writer racing %s reports divergence after commit and preserves both branches', async operation => {
    const fixture = await legacyFixture();
    const session = await ProjectSession.open(fixture.project); sessions.push(session);
    const old = await Database.open({ name: projectDatabaseName(fixture.project.id), version: 1, collections: { documents: {} } });
    databases.push(old);
    const oldHead = (await old.collections.documents!.getDocument(DocID('head')))!;
    const olderRaw = JSON.stringify(imageProject('images/raced-older.png'), null, 2);
    const update = Collection.prototype.updateMultiple;
    let raced = false;
    vi.spyOn(Collection.prototype, 'updateMultiple').mockImplementation(async function (this: Collection, args) {
      if (!raced && args.save?.some(doc => doc.kind === 'asset-head')) {
        raced = true;
        oldHead.payload = olderRaw;
        oldHead.sequence = Number(oldHead.sequence) + 1;
        await old.collections.documents!.save(oldHead);
      }
      return update.call(this, args);
    });
    const work = imageProject('images/current-unsaved.png');
    const promise = operation === 'save' ? session.save(work) : operation === 'checkpoint' ? session.checkpoint(work, 'Raced') : session.restore('legacy-v1', work);
    await expect(promise).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    expect(raced).toBe(true);
    const current = parseProject(await session.readRaw());
    expect(current.nodes[0]!.data.src).toBe(operation === 'restore' ? imageA : 'images/current-unsaved.png');
    expect(await session.readLegacyEditsRaw()).toBe(olderRaw);
    expect(await session.readMigrationBackup()).toBe(fixture.originals.get('head')!.payload);
    const database = await inspect(fixture.project);
    const stored = await records(database);
    expect(stored.filter(doc => doc.body.kind === 'version-info')).toHaveLength(operation === 'save' ? 2 : operation === 'checkpoint' ? 3 : 4);
    expect(stored.some(doc => doc.body.source === 'images/current-unsaved.png')).toBe(true);
    const writes = vi.spyOn(Collection.prototype, 'updateMultiple');
    writes.mockClear();
    await expect(session.save(imageProject())).rejects.toBeInstanceOf(ProjectLegacyConflictError);
    expect(writes).not.toHaveBeenCalled();
  });

  test.each(['missing', 'tampered', 'encoding'] as const)('a %s version asset or encoding prevents every restore write', async damage => {
    const session = await create();
    const database = await inspect(session.entry);
    const collection = database.collections.documents!;
    const version = (await session.versions())[0]!;
    if (damage === 'encoding') {
      const doc = (await collection.getDocument(DocID(`asset-snapshot:${version.id}`)))!;
      doc.encoding = 'unknown-storage-format';
      await collection.save(doc);
    } else {
      const asset = (await records(database)).find(doc => doc.body.kind === 'image-asset')!;
      if (damage === 'missing') await collection.purge(DocID(asset.id)); // test corruption only
      else {
        const doc = (await collection.getDocument(DocID(asset.id)))!;
        doc.source = imageB;
        await collection.save(doc);
      }
    }
    const before = await records(database);
    const writes = vi.spyOn(Collection.prototype, 'updateMultiple');
    await expect(session.restore(version.id, imageProject('images/unsaved-new.png'))).rejects.toThrow('Project data is missing.');
    expect(writes).not.toHaveBeenCalled();
    expect(await records(database)).toEqual(before);
  });

  test('an actual failed restore rolls back the head, both versions and the unsaved backup asset', async () => {
    const session = await create();
    const database = await inspect(session.entry);
    const target = (await session.versions())[0]!;
    const before = await records(database);
    // A colliding version ID forces the real SDK transaction to fail. The
    // unsaved backup includes a new asset that must not escape that transaction.
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(target.id as `${string}-${string}-${string}-${string}-${string}`);
    await expect(session.restore(target.id, imageProject(imageB))).rejects.toBeInstanceOf(ProjectConflictError);
    uuid.mockRestore();
    expect(await records(database)).toEqual(before);
    expect((await session.read()).nodes[0]!.data.src).toBe(imageA);
    await session.restore(target.id, imageProject(imageB));
    const backup = (await session.versions()).find(version => version.reason === 'before-restore')!;
    const recoveredUnsaved = await session.restore(backup.id, await session.read());
    expect(recoveredUnsaved.nodes[0]!.data.src).toBe(imageB);
  });

  test('competing checkpoints never leave the losing snapshot or its new image asset behind', async () => {
    const a = await create();
    const b = await ProjectSession.open(a.entry); sessions.push(b);
    const results = await Promise.allSettled([
      a.checkpoint(imageProject(imageB), 'B'),
      b.checkpoint(imageProject('data:image/png;base64,BwgJ'), 'C'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const database = await inspect(a.entry);
    const stored = await records(database);
    expect(stored.filter(doc => doc.body.kind === 'image-asset')).toHaveLength(2);
    expect(stored.filter(doc => doc.body.kind === 'asset-version')).toHaveLength(2);
    expect(stored.filter(doc => doc.body.kind === 'version-info')).toHaveLength(2);
  });
});
