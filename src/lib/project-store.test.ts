import 'fake-indexeddb/auto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Collection, Database } from '@couchbase/lite-js';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { ProjectCatalog, ProjectSession, projectDatabaseName, CATALOG_DATABASE, ProjectConflictError } from './project-store';
import { blankProject, captureCanvas } from './canvas-project';
import { db } from './db';
import { readProject } from './project';

Database.useIndexedDB(indexedDB, IDBKeyRange);
const sessions: ProjectSession[] = [];
const catalogs: ProjectCatalog[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(sessions.splice(0).map(session => session.close()));
  catalogs.splice(0).forEach(catalog => catalog.close());
  db.close();
  for (const entry of await indexedDB.databases()) if (entry.name) await Database.delete(entry.name);
});
async function setup() { const catalog = await ProjectCatalog.open(); catalogs.push(catalog); return catalog; }
async function create(catalog: ProjectCatalog, name = 'Room A') {
  const session = await catalog.create(name, blankProject()); sessions.push(session); return session;
}

describe('real Couchbase Lite project storage', () => {
  test('creates isolated databases and persists full project contents across reopen', async () => {
    const catalog = await setup();
    const a = await create(catalog), b = await create(catalog, 'Room B');
    const project = blankProject();
    project.nodes.push({ id: 'image', type: 'image', position: { x: 20, y: 30 }, data: { src: 'data:image/png;base64,AQID' } });
    project.room!.name = 'Auditorium';
    project.viewport = { id: 'viewport', x: 30, y: 10, zoom: 1.5 };
    await a.save(project);
    expect((await b.read()).nodes).toHaveLength(0);
    await a.close();
    const reopened = await ProjectSession.open(a.entry); sessions.push(reopened);
    expect(await reopened.read()).toEqual(project);
    expect((await indexedDB.databases()).map(item => item.name)).toEqual(expect.arrayContaining([CATALOG_DATABASE, projectDatabaseName(a.entry.id), projectDatabaseName(b.entry.id)]));
    expect(await catalog.list()).toHaveLength(2);
  });

  test('keeps named versions immutable and restores with a backup and a new revision', async () => {
    const session = await create(await setup());
    const first = blankProject(); first.room!.name = 'First';
    await session.checkpoint(first, 'Design A');
    const savedVersion = (await session.versions())[0]!;
    const edited = { ...first, room: { ...first.room!, name: 'Unsaved work' } };
    const restored = await session.restore(savedVersion.id, edited);
    expect(restored.room!.name).toBe('First');
    const versions = await session.versions();
    expect(versions.map(item => [item.number, item.reason])).toEqual([[4, 'restore'], [3, 'before-restore'], [2, 'manual'], [1, 'initial']]);
    expect(versions[0]!.sourceVersion).toBe(savedVersion.id);
    const recovered = await session.restore(versions[1]!.id, restored);
    expect(recovered.room!.name).toBe('Unsaved work');
    expect((await session.versions()).find(item => item.id === savedVersion.id)).toEqual(savedVersion);
  });

  test('serializes autosaves, captures input immediately and rejects stale sessions', async () => {
    const session = await create(await setup());
    const stale = await ProjectSession.open(session.entry); sessions.push(stale);
    const first = blankProject(), second = blankProject();
    first.room!.name = 'A'; second.room!.name = 'B';
    const saving = session.save(first);
    first.room!.name = 'Changed after submission';
    await saving;
    expect((await session.read()).room!.name).toBe('A');
    await Promise.all([session.save(first), session.save(second)]);
    expect((await session.read()).room!.name).toBe('B');
    await expect(stale.save(blankProject())).rejects.toBeInstanceOf(ProjectConflictError);
    await expect(stale.checkpoint(blankProject(), 'stale')).rejects.toBeInstanceOf(ProjectConflictError);
    expect(await session.versions()).toHaveLength(1);
  });

  test('competing version transactions do not leave orphan versions', async () => {
    const a = await create(await setup());
    const b = await ProjectSession.open(a.entry); sessions.push(b);
    const results = await Promise.allSettled([a.checkpoint(blankProject(), 'A'), b.checkpoint(blankProject(), 'B')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await a.versions()).toHaveLength(2);
  });

  test('a failed restore leaves the head and version history intact and can be retried', async () => {
    const session = await create(await setup());
    const original = await session.read();
    const target = (await session.versions())[0]!;
    const changed = blankProject(); changed.room!.name = 'Keep this';
    const failure = vi.spyOn(Collection.prototype, 'updateMultiple').mockRejectedValueOnce(new DOMException('Disk full', 'QuotaExceededError'));
    await expect(session.restore(target.id, changed)).rejects.toThrow('Disk full');
    failure.mockRestore();
    expect(await session.read()).toEqual(original);
    expect(await session.versions()).toHaveLength(1);
    await session.restore(target.id, changed);
    expect(await session.versions()).toHaveLength(3);
  });

  test('copies the legacy database once without modifying it', async () => {
    await db.open();
    const legacy = { id: 'old', type: 'text' as const, position: { x: 3, y: 5 }, data: { text: 'Do not lose me' } };
    await db.nodes.put(legacy);
    await db.viewport.put({ id: 'viewport', x: 4, y: 6, zoom: 0.7 });
    const catalog = await setup();
    const migrated = await catalog.initialize(readProject, 'Recovered'); sessions.push(migrated);
    expect((await migrated.read()).nodes).toEqual([legacy]);
    expect((await migrated.read()).viewport?.zoom).toBe(0.7);
    expect(await db.nodes.get('old')).toEqual(legacy);
    await migrated.save(blankProject());
    await migrated.close();
    const neverReadLegacy = vi.fn(readProject);
    const reopened = await catalog.initialize(neverReadLegacy, 'Recovered'); sessions.push(reopened);
    expect(neverReadLegacy).not.toHaveBeenCalled();
    expect((await reopened.read()).nodes).toEqual([]);
    expect(await db.nodes.get('old')).toEqual(legacy);
  });

  test('concurrent first launches converge on one migrated project', async () => {
    const a = await setup(), b = await setup();
    const migrated = await Promise.all([
      a.initialize(async () => blankProject(), 'Recovered'),
      b.initialize(async () => blankProject(), 'Recovered'),
    ]);
    sessions.push(...migrated);
    expect(migrated[0]!.entry.id).toBe(migrated[1]!.entry.id);
    expect(await a.list()).toHaveLength(1);
    expect(await migrated[0]!.versions()).toHaveLength(1);
  });

  test('failed migration catalog write recovers the already copied project on retry', async () => {
    const catalog = await setup();
    const source = blankProject(); source.room!.name = 'Original source';
    const failure = vi.spyOn(Collection.prototype, 'save').mockRejectedValueOnce(new DOMException('Disk full', 'QuotaExceededError'));
    await expect(catalog.initialize(async () => source, 'Recovered')).rejects.toThrow('Disk full');
    failure.mockRestore();
    const retried = await catalog.initialize(async () => blankProject(), 'Recovered'); sessions.push(retried);
    expect((await retried.read()).room!.name).toBe('Original source');
    expect(await catalog.list()).toHaveLength(1);
    expect(await retried.versions()).toHaveLength(1);
  });

  test('canvas snapshots preserve strokes, ports, cables, room and settings without editor flags', () => {
    const base = blankProject();
    const snapshot = captureCanvas([
      { id: 'dsp', type: 'database', position: { x: 1, y: 2 }, data: { tag: 'DSP', ports: [{ id: 'p1', label: 'Input' }], autoFocus: true } },
      { id: 'stroke', type: 'drawing', position: { x: 10, y: 20 }, data: { points: [{ x: 1, y: 2 }], color: '#000000', strokeWidth: 2 } },
    ], [{ id: 'edge', source: 'dsp', target: 'tv', data: { label: 'A-01', midX: 5 } }], base.settings, base.signals!, base.room!, [], { x: 1, y: 2, zoom: 1 });
    expect(snapshot.nodes[0]!.data.autoFocus).toBeUndefined();
    expect(snapshot.nodes[0]!.data.ports).toHaveLength(1);
    expect(snapshot.drawings[0]!.points).toEqual([{ x: 11, y: 22 }]);
    expect(snapshot.edges[0]!.label).toBe('A-01');
    expect(snapshot.room).toEqual(base.room);
  });
});
