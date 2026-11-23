import { useCallback, useEffect, useRef, useState } from 'react';
import { X, FolderPlus, History, Save } from 'lucide-react';
import { Canvas, type CanvasHandle } from './canvas';
import { ProjectCatalog, ProjectSession, type ProjectEntry, type ProjectVersion } from '@/lib/project-store';
import { readProject, type ProjectFile } from '@/lib/project';
import { blankProject } from '@/lib/canvas-project';
import { useT } from '@/lib/i18n';
import { downloadBlob } from '@/lib/download';
import { parseProjectArchive } from '@/lib/project-archive';
import { ProjectVersionPreview } from './project-version-preview';

type Recovery = { entry?: ProjectEntry; name: string; raw?: string; olderAppRaw?: string; message: string };

type OpenProject = { session: ProjectSession; initial: ProjectFile; generation: number };
const recentFirst = (a: ProjectEntry, b: ProjectEntry) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);

export function ProjectWorkspace() {
  const t = useT();
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [current, setCurrent] = useState<OpenProject | null>(null);
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [rename, setRename] = useState<string>();
  const [preview, setPreview] = useState<{ id: string; project: ProjectFile; current: ProjectFile }>();
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [storage, setStorage] = useState<StorageEstimate>();
  const archiveInput = useRef<HTMLInputElement>(null);
  const handle = useRef<CanvasHandle | null>(null);
  const active = useRef<OpenProject | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const onReady = useCallback((value: CanvasHandle | null) => { handle.current = value; }, []);
  const markEdited = useCallback(async (session: ProjectSession) => {
    if (catalog) await catalog.markEdited(session.entry.id, session.lastEdited);
  }, [catalog]);
  const transition = useRef(false);

  useEffect(() => {
    let disposed = false;
    let ownedCatalog: ProjectCatalog | undefined;
    let openingSession: ProjectSession | undefined;
    void (async () => {
      const nextCatalog = await ProjectCatalog.open();
      ownedCatalog = nextCatalog;
      const legacyName = t('Recovered drawing');
      let legacyRaw: string | undefined;
      try {
        const session = await nextCatalog.initialize(async () => {
          const project = await readProject();
          legacyRaw = JSON.stringify(project);
          return project;
        }, legacyName);
        openingSession = session;
        const initial = await session.read();
        if (disposed) { await session.close(); nextCatalog.close(); return; }
        const next = { session, initial, generation: 0 };
        active.current = next;
        setCatalog(nextCatalog);
        setCurrent(next);
      } catch (cause) {
        const raw = (await openingSession?.readRaw().catch(() => undefined)) ?? legacyRaw;
        const olderAppRaw = await openingSession?.readLegacyEditsRaw().catch(() => undefined);
        await openingSession?.close();
        const entries = await nextCatalog.list();
        const activeId = await nextCatalog.activeId();
        const entry = openingSession?.entry ?? entries.find((item) => item.id === activeId);
        if (disposed) { nextCatalog.close(); return; }
        setCatalog(nextCatalog);
        setEntries(entries);
        setRecovery({ entry, name: entry?.name ?? legacyName, raw, olderAppRaw, message: cause instanceof Error ? cause.message : String(cause) });
      }
    })().catch(async error => {
      await openingSession?.close();
      ownedCatalog?.close();
      if (!disposed) setError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      disposed = true;
      void active.current?.session.close().finally(() => ownedCatalog?.close());
    };
    // Initial project names follow the locale at first migration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!catalog || !active.current) return;
    setEntries(await catalog.list());
    setVersions(await active.current.session.versions());
  }, [catalog]);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (transition.current) return;
    transition.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { transition.current = false; setBusy(false); }
  }, []);

  const showProjects = useCallback(() => {
    setOpen(true);
    setPreview(undefined);
    setRename(undefined);
    setSelectedVersions([]);
    setConfirmRemoval(false);
    void navigator.storage?.estimate().then(setStorage).catch(() => undefined);
    void run(refresh);
  }, [run, refresh]);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const switchTo = async (nextSession: ProjectSession) => {
    try {
      const initial = await nextSession.read();
      await catalog!.activate(nextSession.entry.id);
      const previous = active.current;
      const next = { session: nextSession, initial, generation: 0 };
      active.current = next;
      handle.current = null;
      setCurrent(next);
      setRecovery(null);
      setOpen(false);
      await previous?.session.close();
    } catch (error) { await nextSession.close(); throw error; }
  };

  const createProject = async (project: ProjectFile, name: string) => {
    if (!catalog || !handle.current) throw new Error('Canvas is not ready to save.');
    await handle.current.flush();
    await switchTo(await catalog.create(name, project));
    setProjectName('');
  };

  const importProject = async (project: ProjectFile, name: string) => {
    if (transition.current) throw new Error('A project operation is already running.');
    transition.current = true;
    setBusy(true);
    try { await createProject(project, name); }
    finally { transition.current = false; setBusy(false); }
  };

  const capture = () => {
    if (!handle.current) throw new Error('Canvas is not ready to save.');
    return handle.current.capture();
  };
  const switchEntry = async (entry: ProjectEntry) => {
    await handle.current?.flush();
    await switchTo(await ProjectSession.open(entry));
  };
  const archiveEntry = async (entry: ProjectEntry) => {
    if (entry.id === active.current?.session.entry.id) {
      const next = entries.filter(item => !item.archived && item.id !== entry.id).sort(recentFirst)[0];
      if (next) await switchEntry(next);
      else await createProject(blankProject(), t('Untitled project'));
    }
    await catalog!.setArchived(entry.id, true);
    await refresh();
  };
  const importArchive = async (file: File) => {
    let archive;
    try { archive = parseProjectArchive(await file.text()); }
    catch { throw new Error('This file is not a valid project archive.'); }
    await handle.current?.flush();
    await switchTo(await catalog!.importArchive(archive));
  };
  const exportArchive = async () => {
    const archive = await active.current!.session.exportArchive(capture());
    const name = archive.name.replace(/[^\p{L}\p{N} ._-]/gu, '_');
    downloadBlob(new Blob([JSON.stringify(archive)], { type: 'application/json' }), `${name}.iconic-archive.json`);
  };

  if (!current && recovery && catalog) return (
    <main className="grid min-h-screen place-content-center gap-4 p-8">
      <h1 className="text-lg font-semibold">{t('The active project could not be opened.')}</h1>
      <p>{recovery.name}</p>
      <p className="max-w-xl text-sm text-muted-foreground" role="alert">{t(recovery.message)}</p>
      <div className="flex flex-wrap gap-4">
        {recovery.raw !== undefined && (
          <button className="underline" onClick={() => {
            const name = recovery.name.replace(/[^\p{L}\p{N} ._-]/gu, '_');
            downloadBlob(new Blob([recovery.raw!], { type: 'application/json' }), `${name}-${recovery.olderAppRaw !== undefined ? 'current' : 'original'}.json`);
          }}>{t(recovery.olderAppRaw !== undefined ? 'Export current project data' : 'Export original project data')}</button>
        )}
        {recovery.olderAppRaw !== undefined && (
          <button className="underline" onClick={() => {
            const name = recovery.name.replace(/[^\p{L}\p{N} ._-]/gu, '_');
            downloadBlob(new Blob([recovery.olderAppRaw!], { type: 'application/json' }), `${name}-older-version.json`);
          }}>{t('Export older-version project data')}</button>
        )}
        <button className="underline" disabled={busy}
          onClick={() => void run(async () => switchTo(await catalog.create(t('Untitled project'), blankProject())))}>
          {t('Create a blank project')}
        </button>
      </div>
      {entries.some((entry) => !entry.archived && entry.id !== recovery.entry?.id) && (
        <section>
          <h2 className="font-medium">{t('Open another project')}</h2>
          <ul className="mt-1 grid gap-1">
            {entries.filter((entry) => !entry.archived && entry.id !== recovery.entry?.id).map((entry) => (
              <li key={entry.id}>
                <button className="underline" disabled={busy}
                  onClick={() => void run(async () => switchTo(await ProjectSession.open(entry)))}>
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </main>
  );

  if (!current) return (
    <main className="grid h-screen place-content-center gap-3 p-8">
      <p role={error ? 'alert' : 'status'}>{error ? t(error) : t('Opening projects…')}</p>
      {error && <button className="underline" onClick={() => location.reload()}>{t('Retry')}</button>}
    </main>
  );

  const visibleEntries = entries.filter(entry => !!entry.archived === showArchived && entry.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort(recentFirst);
  const action = "rounded px-2 py-1 text-xs underline disabled:opacity-50";

  return <>
    <Canvas key={`${current.session.entry.id}:${current.generation}`} session={current.session} initial={current.initial}
      blocked={busy || open} onProjects={showProjects} onImport={importProject} onReady={onReady} onSaved={markEdited} />
    <dialog ref={dialog} aria-labelledby="project-dialog-title" onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }}
      className="fixed inset-0 m-auto max-h-[85vh] w-[720px] max-w-[94vw] overflow-y-auto rounded-2xl border border-[var(--hairline)] bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40">
      <header className="mb-5 flex items-center justify-between">
        <div><h2 id="project-dialog-title" className="text-lg font-semibold">{t('Projects and versions')}</h2><p className="text-sm text-muted-foreground">{current.session.entry.name}</p></div>
        <button aria-label={t('Close')} disabled={busy} onClick={() => setOpen(false)}><X size={20} /></button>
      </header>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-400/40 p-3 text-sm">{t(error)}</p>}
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-medium"><FolderPlus size={16} />{t('Projects')}</h3>
          <form className="mb-4 flex gap-2" onSubmit={event => { event.preventDefault(); void run(() => createProject(blankProject(), projectName)); }}>
            <input className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5 text-sm" aria-label={t('Project name')} placeholder={t('Project name')} value={projectName} maxLength={200} onChange={e => setProjectName(e.target.value)} disabled={busy} />
            <button className="rounded bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || !projectName.trim()}>{t('Create')}</button>
          </form>
          <div className="mb-3 grid gap-2 text-sm">
            <input type="search" aria-label={t('Search projects')} placeholder={t('Search projects')} value={search}
              onChange={event => setSearch(event.target.value)} className="rounded border bg-transparent px-2 py-1.5" />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />{t('Show archived projects')}
            </label>
            <div className="flex flex-wrap gap-1">
              <button className={action} disabled={busy} onClick={() => archiveInput.current?.click()}>{t('Import project archive')}</button>
              <button className={action} disabled={busy} onClick={() => void run(exportArchive)}>{t('Export project archive')}</button>
              <input ref={archiveInput} type="file" accept=".json" hidden onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void run(() => importArchive(file));
              }} />
            </div>
          </div>
          <ul className="space-y-1">
            {visibleEntries.map(entry => <li key={entry.id} className="rounded-lg border border-[var(--hairline)] p-2 text-sm">
              <button className="w-full text-left disabled:opacity-60" disabled={busy || entry.archived || entry.id === current.session.entry.id}
                onClick={() => void run(() => switchEntry(entry))}>
                <span className="block break-words font-medium">{entry.name}</span>
                <span className="text-xs text-muted-foreground">{entry.id === current.session.entry.id ? t('Current project') : new Date(entry.updatedAt ?? entry.createdAt).toLocaleString()}</span>
              </button>
              {rename === entry.id ? <form className="mt-2 flex gap-1" onSubmit={event => {
                event.preventDefault();
                const name = String(new FormData(event.currentTarget).get('name') ?? '');
                void run(async () => {
                  const saved = await catalog!.rename(entry.id, name);
                  if (entry.id === current.session.entry.id) {
                    current.session.entry.name = saved.name;
                    setCurrent({ ...current });
                  }
                  setRename(undefined);
                  await refresh();
                });
              }}>
                <input name="name" aria-label={t('New project name')} defaultValue={entry.name} required maxLength={200} className="min-w-0 flex-1 rounded border bg-transparent px-2" />
                <button className={action} disabled={busy}>{t('Rename project')}</button>
                <button type="button" className={action} onClick={() => setRename(undefined)}>{t('Cancel')}</button>
              </form> : <div className="mt-1 flex flex-wrap">
                {entry.archived ? <button className={action} disabled={busy} onClick={() => void run(async () => {
                  await catalog!.setArchived(entry.id, false); await refresh();
                })}>{t('Restore archived project')}</button> : <>
                  <button className={action} disabled={busy} onClick={() => setRename(entry.id)}>{t('Rename project')}</button>
                  <button className={action} disabled={busy} onClick={() => void run(async () => {
                    if (entry.id === current.session.entry.id) await createProject(capture(), `${entry.name.slice(0, 180)} · ${t('Copy')}`);
                    else {
                      const session = await ProjectSession.open(entry);
                      try { await createProject(await session.read(), `${entry.name.slice(0, 180)} · ${t('Copy')}`); }
                      finally { await session.close(); }
                    }
                  })}>{t('Duplicate project')}</button>
                  <button className={action} disabled={busy} onClick={() => void run(() => archiveEntry(entry))}>{t('Archive project')}</button>
                </>}
              </div>}
            </li>)}
          </ul>
          {!visibleEntries.length && <p className="mt-2 text-sm text-muted-foreground">{t('No matching projects.')}</p>}
        </section>
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-medium"><History size={16} />{t('Version history')}</h3>
          <form className="mb-3 flex gap-2" onSubmit={event => { event.preventDefault(); void run(async () => {
            if (!handle.current) throw new Error('Canvas is not ready to save.');
            await current.session.checkpoint(handle.current.capture(), versionName);
            await markEdited(current.session).catch(() => undefined);
            setVersionName(''); await refresh();
          }); }}>
            <input className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5 text-sm" aria-label={t('Version name')} placeholder={t('Version name')} value={versionName} maxLength={200} onChange={e => setVersionName(e.target.value)} disabled={busy} />
            <button className="rounded bg-primary px-3 text-primary-foreground disabled:opacity-50" aria-label={t('Save version')} disabled={busy || !versionName.trim()}><Save size={16} /></button>
          </form>
          <p className="mb-3 text-xs text-muted-foreground">{t('Restoring keeps a backup of your current work and creates a new version.')}</p>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('Retained versions')}: {versions.length}
            {storage?.usage !== undefined && storage.quota !== undefined && <><br />{t('Local app storage')}: {(storage.usage / 1048576).toFixed(1)} / {(storage.quota / 1048576).toFixed(1)} MiB</>}
          </p>
          <ol className="space-y-2">
            {versions.map(version => <li key={version.id} className="rounded-lg border border-[var(--hairline)] p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="break-words font-medium">v{version.number} · {version.label || t(`version.${version.reason}`)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</p>
                  {version.label && <p className="text-xs text-muted-foreground">{t(`version.${version.reason}`)}</p>}
                </div>
                <button className={action} disabled={busy} aria-label={`${t('Preview version')} v${version.number}`} onClick={() => void run(async () => {
                  setPreview({ id: version.id, project: await current.session.readVersion(version.id), current: capture() });
                })}>{t('Preview version')}</button>
              </div>
              {preview?.id === version.id && <>
                <ProjectVersionPreview project={preview.project} current={preview.current} />
                <button className={action} disabled={busy} aria-label={`${t('Restore')} v${version.number}`} onClick={() => void run(async () => {
                  if (!handle.current) throw new Error('Canvas is not ready to save.');
                  const initial = await current.session.restore(version.id, handle.current.capture());
                  await markEdited(current.session).catch(() => undefined);
                  const next = { ...current, initial, generation: current.generation + 1 };
                  active.current = next; handle.current = null; setCurrent(next); setOpen(false);
                })}>{t('Restore')}</button>
              </>}
              <label className="mt-1 flex items-center gap-2 text-xs">
                <input type="checkbox" disabled={busy || confirmRemoval} checked={selectedVersions.includes(version.id)} onChange={event => {
                  setSelectedVersions(previous => event.target.checked ? [...previous, version.id] : previous.filter(id => id !== version.id));
                }} />{t('Select for removal')}
              </label>
            </li>)}
          </ol>
          <button className={action} disabled={busy || !selectedVersions.length || selectedVersions.length === versions.length}
            onClick={() => setConfirmRemoval(true)}>{t('Review selected versions for removal')}</button>
          {confirmRemoval && <section className="mt-2 rounded border border-[var(--hairline)] p-2 text-sm">
            <p>{t('Only these selected versions will be removed. The current drawing and other versions are kept.')}</p>
            <ul className="ml-4 list-disc">{versions.filter(version => selectedVersions.includes(version.id)).map(version =>
              <li key={version.id}>v{version.number} · {version.label || t(`version.${version.reason}`)}</li>)}</ul>
            <button className={action} disabled={busy} onClick={() => setConfirmRemoval(false)}>{t('Cancel')}</button>
            <button className={action} disabled={busy} onClick={() => void run(async () => {
              await current.session.removeVersions(selectedVersions);
              setPreview(undefined); setSelectedVersions([]); setConfirmRemoval(false); await refresh();
            })}>{t('Remove selected versions')}</button>
          </section>}
        </section>
      </div>
    </dialog>
  </>;
}
