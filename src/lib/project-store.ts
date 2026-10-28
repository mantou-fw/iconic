import { Database, DocID, meta, ConflictError, MultipleConflictsError, type CBLDocument } from '@couchbase/lite-js';
import { parseProject, type ProjectFile } from './project';

export const CATALOG_DATABASE = 'iconic-project-catalog';
export const projectDatabaseName = (id: string) => `iconic-project-${id}`;
export type ProjectEntry = { id: string; name: string; createdAt: string };
export type VersionReason = 'initial' | 'manual' | 'before-restore' | 'restore';
export type ProjectVersion = { id: string; number: number; label: string; createdAt: string; reason: VersionReason; sourceVersion: string };
type CatalogDoc = { entries: string; active: string; migrated: boolean };
type ProjectDoc = {
  kind: 'head' | 'version'; name: string; createdAt: string; updatedAt: string;
  sequence: number; versionNumber: number; label: string; reason: string; sourceVersion: string; payload: string;
};
type ProjectDB = Database<{ documents: ProjectDoc }>;

export class ProjectConflictError extends Error {
  constructor() { super('This project changed in another window. Export your work before reopening the project.'); }
}

const encode = (project: ProjectFile) => JSON.stringify(project);
const sameContent = (a: string, b: string) => {
  const left = JSON.parse(a), right = JSON.parse(b);
  delete left.savedAt; delete right.savedAt;
  return JSON.stringify(left) === JSON.stringify(right);
};

/** One open project and its expected revision. A stale editor never overwrites a newer head. */
export class ProjectSession {
  private pending: Promise<unknown> = Promise.resolve();
  private sequence: number;
  private closed = false;
  private constructor(readonly entry: ProjectEntry, private database: ProjectDB, head: ProjectDoc) {
    this.sequence = head.sequence;
  }

  static async open(entry: ProjectEntry) {
    const database = await Database.open<{ documents: ProjectDoc }>({ name: projectDatabaseName(entry.id), version: 1, collections: { documents: {} } });
    const head = await database.collections.documents.getDocument(DocID('head'));
    if (!head) { database.close(); throw new Error('Project data is missing.'); }
    return new ProjectSession(entry, database, head);
  }

  static async create(entry: ProjectEntry, project: ProjectFile) {
    const database = await Database.open<{ documents: ProjectDoc }>({ name: projectDatabaseName(entry.id), version: 1, collections: { documents: {} } });
    try {
      const collection = database.collections.documents;
      const existing = await collection.getDocument(DocID('head'));
      // A deterministic migration ID allows recovery after a catalog write failed.
      if (existing) return new ProjectSession(entry, database, existing);
      const body: ProjectDoc = { kind: 'head', name: entry.name, createdAt: entry.createdAt, updatedAt: entry.createdAt, sequence: 1, versionNumber: 1, label: '', reason: 'initial', sourceVersion: '', payload: encode(project) };
      const head = collection.createDocument(DocID('head'), body);
      const initial = collection.createDocument(DocID(crypto.randomUUID()), { ...body, kind: 'version' });
      await collection.updateMultiple({ save: [head, initial], bestEffort: false });
      return new ProjectSession(entry, database, body);
    } catch (error) {
      // Two initial tabs can race to copy the same legacy database. Only the
      // winning initial transaction is retained; the other opens that copy.
      if (error instanceof MultipleConflictsError) {
        const head = await database.collections.documents.getDocument(DocID('head'));
        if (head) return new ProjectSession(entry, database, head);
      }
      database.close(); throw error;
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

  private async head() {
    const head = await this.database.collections.documents.getDocument(DocID('head'));
    if (!head) throw new Error('Project data is missing.');
    if (head.sequence !== this.sequence) throw new ProjectConflictError();
    return head;
  }

  read(): Promise<ProjectFile> {
    return this.enqueue(async () => parseProject((await this.head()).payload));
  }

  save(project: ProjectFile): Promise<void> {
    const payload = encode(project); // Capture at call time, before queued work runs.
    return this.enqueue(async () => {
      const head = await this.head();
      if (sameContent(head.payload, payload)) return;
      head.payload = payload;
      head.updatedAt = new Date().toISOString();
      head.sequence++;
      await this.database.collections.documents.save(head);
      this.sequence = head.sequence;
    });
  }

  versions(): Promise<ProjectVersion[]> {
    return this.enqueue(async () => {
      const versions: ProjectVersion[] = [];
      await this.database.collections.documents.eachDocument(doc => {
        if (doc.kind === 'version') versions.push({ id: meta(doc).id, number: doc.versionNumber, label: doc.label, createdAt: doc.createdAt, reason: doc.reason as VersionReason, sourceVersion: doc.sourceVersion });
        return true;
      });
      return versions.sort((a, b) => b.number - a.number);
    });
  }

  private version(head: ProjectDoc, number: number, payload: string, reason: VersionReason, label = '', sourceVersion = '') {
    return this.database.collections.documents.createDocument(DocID(crypto.randomUUID()), {
      ...head, kind: 'version', versionNumber: number, payload, reason, label, sourceVersion, createdAt: new Date().toISOString(),
    });
  }

  checkpoint(project: ProjectFile, label: string): Promise<void> {
    if (!label.trim() || label.trim().length > 200) return Promise.reject(new Error('Enter a version name (1–200 characters).'));
    const payload = encode(project);
    return this.enqueue(async () => {
      const head = await this.head();
      const version = this.version(head, head.versionNumber + 1, payload, 'manual', label.trim());
      head.payload = payload;
      head.sequence++;
      head.versionNumber++;
      head.updatedAt = new Date().toISOString();
      await this.database.collections.documents.updateMultiple({ save: [head, version], bestEffort: false });
      this.sequence = head.sequence;
    });
  }

  restore(versionId: string, current: ProjectFile): Promise<ProjectFile> {
    const backupPayload = encode(current);
    return this.enqueue(async () => {
      const collection = this.database.collections.documents;
      const head = await this.head();
      const target = await collection.getDocument(DocID(versionId));
      if (!target || target.kind !== 'version') throw new Error('Version not found.');
      const restored = { ...parseProject(target.payload), savedAt: new Date().toISOString() };
      const payload = encode(restored);
      const backup = this.version(head, head.versionNumber + 1, backupPayload, 'before-restore');
      const version = this.version(head, head.versionNumber + 2, payload, 'restore', target.label, versionId);
      head.payload = payload;
      head.sequence++;
      head.versionNumber += 2;
      head.updatedAt = new Date().toISOString();
      await collection.updateMultiple({ save: [head, backup, version], bestEffort: false });
      this.sequence = head.sequence;
      return restored;
    });
  }

  async close() { await this.pending; this.closed = true; this.database.close(); }
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
      if (!(JSON.parse(doc.entries) as ProjectEntry[]).some(entry => entry.id === id)) throw new Error('Project not found.');
      doc.active = id;
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
  async create(name: string, project: ProjectFile) {
    if (!name.trim() || name.trim().length > 200) throw new Error('Enter a project name (1–200 characters).');
    const entry: ProjectEntry = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() };
    const session = await ProjectSession.create(entry, project);
    try { await this.register(entry); return session; }
    catch (error) { await session.close(); throw error; }
  }
  async initialize(readLegacy: () => Promise<ProjectFile>, legacyName: string) {
    const state = await this.state();
    if (!state.migrated) {
      const entry: ProjectEntry = { id: 'legacy-import', name: legacyName, createdAt: new Date().toISOString() };
      const session = await ProjectSession.create(entry, await readLegacy());
      try { await this.register(entry, true); return session; }
      catch (error) { await session.close(); throw error; }
    }
    const entries = await this.list();
    const entry = entries.find(item => item.id === state.active) ?? entries[0];
    if (!entry) throw new Error('Project catalog is empty.');
    return ProjectSession.open(entry);
  }
  close() { this.database.close(); }
}
