import { useCallback, useEffect, useRef, useState } from 'react';
import { X, FolderPlus, History, Save } from 'lucide-react';
import { Canvas, type CanvasHandle } from './canvas';
import { ProjectCatalog, ProjectSession, type ProjectEntry, type ProjectVersion } from '@/lib/project-store';
import { readProject, type ProjectFile } from '@/lib/project';
import { blankProject } from '@/lib/canvas-project';
import { useT } from '@/lib/i18n';

type OpenProject = { session: ProjectSession; initial: ProjectFile; generation: number };

export function ProjectWorkspace() {
  const t = useT();
  const [current, setCurrent] = useState<OpenProject | null>(null);
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [versionName, setVersionName] = useState('');
  const handle = useRef<CanvasHandle | null>(null);
  const active = useRef<OpenProject | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const onReady = useCallback((value: CanvasHandle | null) => { handle.current = value; }, []);
  const transition = useRef(false);

  useEffect(() => {
    let disposed = false;
    let ownedCatalog: ProjectCatalog | undefined;
    let openingSession: ProjectSession | undefined;
    void (async () => {
      const nextCatalog = await ProjectCatalog.open();
      ownedCatalog = nextCatalog;
      const session = await nextCatalog.initialize(readProject, t('Recovered drawing'));
      openingSession = session;
      const initial = await session.read();
      if (disposed) { await session.close(); nextCatalog.close(); return; }
      const next = { session, initial, generation: 0 };
      active.current = next;
      setCatalog(nextCatalog);
      setCurrent(next);
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

  if (!current) return (
    <main className="grid h-screen place-content-center gap-3 p-8">
      <p role={error ? 'alert' : 'status'}>{error ? t(error) : t('Opening projects…')}</p>
      {error && <button className="underline" onClick={() => location.reload()}>{t('Retry')}</button>}
    </main>
  );

  return <>
    <Canvas key={`${current.session.entry.id}:${current.generation}`} session={current.session} initial={current.initial}
      blocked={busy || open} onProjects={showProjects} onImport={importProject} onReady={onReady} />
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
          <ul className="space-y-1">
            {entries.map(entry => <li key={entry.id}>
              <button className="w-full rounded-lg border border-[var(--hairline)] p-2 text-left text-sm disabled:opacity-60" disabled={busy || entry.id === current.session.entry.id}
                onClick={() => void run(async () => { if (!handle.current) throw new Error('Canvas is not ready to save.'); await handle.current.flush(); await switchTo(await ProjectSession.open(entry)); })}>
                <span className="block break-words font-medium">{entry.name}</span>
                <span className="text-xs text-muted-foreground">{entry.id === current.session.entry.id ? t('Current project') : new Date(entry.createdAt).toLocaleDateString()}</span>
              </button>
            </li>)}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 flex items-center gap-2 font-medium"><History size={16} />{t('Version history')}</h3>
          <form className="mb-3 flex gap-2" onSubmit={event => { event.preventDefault(); void run(async () => {
            if (!handle.current) throw new Error('Canvas is not ready to save.');
            await current.session.checkpoint(handle.current.capture(), versionName);
            setVersionName(''); await refresh();
          }); }}>
            <input className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5 text-sm" aria-label={t('Version name')} placeholder={t('Version name')} value={versionName} maxLength={200} onChange={e => setVersionName(e.target.value)} disabled={busy} />
            <button className="rounded bg-primary px-3 text-primary-foreground disabled:opacity-50" aria-label={t('Save version')} disabled={busy || !versionName.trim()}><Save size={16} /></button>
          </form>
          <p className="mb-3 text-xs text-muted-foreground">{t('Restoring keeps a backup of your current work and creates a new version.')}</p>
          <ol className="space-y-2">
            {versions.map(version => <li key={version.id} className="rounded-lg border border-[var(--hairline)] p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="break-words font-medium">v{version.number} · {version.label || t(`version.${version.reason}`)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</p>
                  {version.label && <p className="text-xs text-muted-foreground">{t(`version.${version.reason}`)}</p>}
                </div>
                <button className="shrink-0 underline disabled:opacity-50" disabled={busy} aria-label={`${t('Restore')} v${version.number}`} onClick={() => void run(async () => {
                  if (!handle.current) throw new Error('Canvas is not ready to save.');
                  const initial = await current.session.restore(version.id, handle.current.capture());
                  const next = { ...current, initial, generation: current.generation + 1 };
                  active.current = next; handle.current = null; setCurrent(next); setOpen(false);
                })}>{t('Restore')}</button>
              </div>
            </li>)}
          </ol>
        </section>
      </div>
    </dialog>
  </>;
}
