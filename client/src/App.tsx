import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type DrawState, type MapHandle } from './components/MapView.tsx';
import Sidebar, { type Tab } from './components/Sidebar.tsx';
import ProjectForm from './components/ProjectForm.tsx';
import { ProjectCard, ProjectRecord } from './components/ProjectCard.tsx';
import LandForm from './components/LandForm.tsx';
import LandCard from './components/LandCard.tsx';
import DrawToolbar from './components/DrawToolbar.tsx';
import { LoginDialog, UsersDialog } from './components/AccountDialogs.tsx';
import { ConfirmDialog, type ConfirmState } from './components/ui.tsx';
import { useAuth, useData, useToast } from './state/store.tsx';
import { api } from './lib/api.ts';
import { emptyLandFilters, emptyProjectFilters, filterLands, filterProjects } from './lib/filters.ts';
import { fromPolygon } from './lib/geo.ts';
import { formatCoords } from './lib/format.ts';
import type { Basemap } from './lib/mapStyle.ts';
import type { LandInput, LngLat, ProjectInput } from './lib/types.ts';
import type { SinglePhotoValue, MultiPhotoValue } from './components/PhotoFields.tsx';

type Panel =
  | { kind: 'none' }
  | { kind: 'project'; id: string }
  | { kind: 'record'; id: string }
  | { kind: 'projectForm'; id?: string }
  | { kind: 'land'; id: string }
  | { kind: 'landForm'; id?: string };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function App() {
  const { user, checked, isAdmin, logout } = useAuth();
  const data = useData(user?.id ?? null, checked);
  const toast = useToast();
  const mapRef = useRef<MapHandle>(null);

  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const [selection, setSelection] = useState<LngLat | null>(null);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [search, setSearch] = useState('');
  const [projectFilters, setProjectFilters] = useState(emptyProjectFilters);
  const [landFilters, setLandFilters] = useState(emptyLandFilters);
  const [tab, setTab] = useState<Tab>('projects');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [dialog, setDialog] = useState<'login' | 'users' | null>(null);

  const visibleProjects = useMemo(() => filterProjects(data.projects, search, projectFilters), [data.projects, search, projectFilters]);
  const visibleLands = useMemo(() => filterLands(data.lands, search, landFilters), [data.lands, search, landFilters]);

  // While a plot's boundary is being edited, the draft replaces its saved polygon on the map.
  const editingLandId = panel.kind === 'landForm' ? panel.id : undefined;
  const mapLands = useMemo(() => (editingLandId ? visibleLands.filter((l) => l.id !== editingLandId) : visibleLands), [visibleLands, editingLandId]);

  const projectById = (id: string) => data.projects.find((p) => p.id === id);
  const landById = (id: string) => data.lands.find((l) => l.id === id);

  const selectedProjectId =
    panel.kind === 'project' || panel.kind === 'record' ? panel.id : panel.kind === 'projectForm' ? (panel.id ?? null) : null;
  const selectedLandId = panel.kind === 'land' ? panel.id : null;

  // Signed out while an admin-only panel was open: close it.
  useEffect(() => {
    if (!isAdmin && (panel.kind === 'projectForm' || panel.kind === 'landForm' || draw)) {
      setPanel({ kind: 'none' });
      setDraw(null);
    }
    if (!isAdmin && dialog === 'users') setDialog(null);
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------- selection */
  const openProject = useCallback((id: string, fly = false) => {
    const p = data.projects.find((x) => x.id === id);
    if (!p) return;
    setPanel({ kind: 'project', id });
    setMobileMenu(false);
    if (fly) mapRef.current?.flyTo([p.longitude, p.latitude]);
  }, [data.projects]);

  const openLand = useCallback((id: string, zoom = false) => {
    const l = data.lands.find((x) => x.id === id);
    if (!l) return;
    setPanel({ kind: 'land', id });
    setMobileMenu(false);
    if (zoom) mapRef.current?.fitPolygon(fromPolygon(l.geometry));
  }, [data.lands]);

  const onMapClick = (p: LngLat) => {
    setSelection(p);
    if (panel.kind === 'project' || panel.kind === 'land' || panel.kind === 'record') setPanel({ kind: 'none' });
  };

  /* --------------------------------------------------------------- projects */
  const startAddProject = () => {
    setDraw(null);
    setPanel({ kind: 'projectForm' });
    setMobileMenu(false);
  };

  const editProject = (id: string) => {
    const p = projectById(id);
    if (!p) return;
    setSelection([p.longitude, p.latitude]);
    setPanel({ kind: 'projectForm', id });
  };

  const saveProject = async (input: ProjectInput, photo: SinglePhotoValue, id?: string) => {
    let saved = id ? await api.updateProject(id, input) : await api.createProject(input);
    data.upsertProject(saved);
    try {
      if (photo.file) saved = await api.uploadProjectPhoto(saved.id, photo.file);
      else if (photo.remove && saved.photo_id) saved = await api.deleteProjectPhoto(saved.id);
      data.upsertProject(saved);
      toast(id ? 'Project updated' : 'Project added');
    } catch (err) {
      toast(`Project saved, but the photo was not: ${(err as Error).message}`, 'error');
    }
    data.refreshStats();
    setSelection(null);
    setPanel({ kind: 'project', id: saved.id });
  };

  const deleteProject = (id: string) => {
    const p = projectById(id);
    if (!p) return;
    setConfirm({
      title: 'Delete project',
      message: <>Delete <strong className="text-ink">{p.name}</strong> and its photograph? This cannot be undone.</>,
      confirmLabel: 'Delete project',
      onConfirm: async () => {
        try {
          await api.deleteProject(id);
          data.removeProject(id);
          data.refreshStats();
          setPanel({ kind: 'none' });
          toast('Project deleted');
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      },
    });
  };

  /* ------------------------------------------------------------------- land */
  const startAddLand = () => {
    setPanel({ kind: 'none' });
    setSelection(null);
    setDraw({ mode: 'draw', vertices: [], selected: null, history: [] });
    setMobileMenu(false);
  };

  const finishDrawing = useCallback(() => {
    setDraw((d) => (d && d.vertices.length >= 3 ? { ...d, mode: 'edit', selected: null } : d));
    setPanel((p) => (p.kind === 'landForm' ? p : { kind: 'landForm' }));
  }, []);

  const editLand = (id: string) => {
    const l = landById(id);
    if (!l) return;
    const vertices = fromPolygon(l.geometry);
    setDraw({ mode: 'edit', vertices, selected: null, history: [] });
    setPanel({ kind: 'landForm', id });
    mapRef.current?.fitPolygon(vertices);
  };

  const cancelLand = useCallback(() => {
    setDraw(null);
    setPanel((p) => (p.kind === 'landForm' && p.id ? { kind: 'land', id: p.id } : { kind: 'none' }));
  }, []);

  const saveLand = async (input: LandInput, photos: MultiPhotoValue, id?: string) => {
    let saved = id ? await api.updateLand(id, input) : await api.createLand(input);
    data.upsertLand(saved);
    setDraw(null);
    const problems: string[] = [];
    for (const pid of photos.removedIds) {
      await api.deletePhoto(pid).catch((e: Error) => problems.push(e.message));
    }
    if (photos.added.length) {
      try {
        saved = await api.uploadLandPhotos(saved.id, photos.added);
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    if (photos.removedIds.length && !photos.added.length) saved = await api.getLand(saved.id).catch(() => saved);
    data.upsertLand(saved);
    data.refreshStats();
    setPanel({ kind: 'land', id: saved.id });
    if (problems.length) toast(`Land saved, but some photo changes failed: ${problems.join(' ')}`, 'error');
    else toast(id ? 'Land plot updated' : 'Land plot saved');
  };

  const deleteLand = (id: string) => {
    const l = landById(id);
    if (!l) return;
    setConfirm({
      title: 'Delete land plot',
      message: <>Delete <strong className="text-ink">{l.name}</strong>, its boundary, contacts and photographs? This cannot be undone.</>,
      confirmLabel: 'Delete land plot',
      onConfirm: async () => {
        try {
          await api.deleteLand(id);
          data.removeLand(id);
          data.refreshStats();
          setPanel({ kind: 'none' });
          toast('Land plot deleted');
        } catch (err) {
          toast((err as Error).message, 'error');
        }
      },
    });
  };

  /* --------------------------------------------------------- draw controls */
  const undo = useCallback(() => {
    setDraw((d) => {
      if (!d || d.history.length === 0) return d;
      const prev = d.history[d.history.length - 1];
      return { ...d, vertices: prev, history: d.history.slice(0, -1), selected: null };
    });
  }, []);

  const removeVertex = useCallback(() => {
    setDraw((d) => {
      if (!d || d.selected == null || d.vertices.length <= 3) return d;
      return { ...d, vertices: d.vertices.filter((_, i) => i !== d.selected), history: [...d.history, d.vertices], selected: null };
    });
  }, []);

  useEffect(() => {
    if (!draw) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape' && !confirm && !dialog) cancelLand();
      else if (e.key === 'Enter' && draw.mode === 'draw' && draw.vertices.length >= 3) finishDrawing();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && draw.mode === 'edit') {
        e.preventDefault();
        removeVertex();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw, undo, removeVertex, cancelLand, finishDrawing, confirm, dialog]);

  /* ------------------------------------------------------------------ view */
  const renderPanel = () => {
    switch (panel.kind) {
      case 'project': {
        const p = projectById(panel.id);
        return p ? (
          <ProjectCard
            project={p}
            isAdmin={isAdmin}
            onClose={() => setPanel({ kind: 'none' })}
            onEdit={() => editProject(p.id)}
            onRecord={() => setPanel({ kind: 'record', id: p.id })}
            onDelete={() => deleteProject(p.id)}
          />
        ) : null;
      }
      case 'record': {
        const p = projectById(panel.id);
        return p ? <ProjectRecord project={p} onBack={() => setPanel({ kind: 'project', id: p.id })} onClose={() => setPanel({ kind: 'none' })} /> : null;
      }
      case 'projectForm': {
        const p = panel.id ? projectById(panel.id) : undefined;
        return (
          <ProjectForm
            key={panel.id ?? 'new'}
            project={p}
            selection={selection}
            onCoordsChange={setSelection}
            onSave={(input, photo) => saveProject(input, photo, panel.id)}
            onCancel={() => {
              setSelection(null);
              setPanel(panel.id ? { kind: 'project', id: panel.id } : { kind: 'none' });
            }}
          />
        );
      }
      case 'land': {
        const l = landById(panel.id);
        return l ? (
          <LandCard
            land={l}
            isAdmin={isAdmin}
            signedIn={!!user}
            onClose={() => setPanel({ kind: 'none' })}
            onEdit={() => editLand(l.id)}
            onDelete={() => deleteLand(l.id)}
            onZoom={() => mapRef.current?.fitPolygon(fromPolygon(l.geometry))}
          />
        ) : null;
      }
      case 'landForm':
        return draw ? (
          <LandForm
            key={panel.id ?? 'new'}
            land={panel.id ? landById(panel.id) : undefined}
            vertices={draw.vertices}
            onSave={(input, photos) => saveLand(input, photos, panel.id)}
            onCancel={cancelLand}
          />
        ) : null;
      default:
        return null;
    }
  };

  const panelOpen = panel.kind !== 'none';

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-paper text-ink">
      <Sidebar
        tab={tab}
        onTab={setTab}
        search={search}
        onSearch={setSearch}
        projects={data.projects}
        visibleProjects={visibleProjects}
        lands={data.lands}
        visibleLands={visibleLands}
        projectFilters={projectFilters}
        onProjectFilters={setProjectFilters}
        landFilters={landFilters}
        onLandFilters={setLandFilters}
        stats={data.stats}
        loading={data.loading}
        error={data.error}
        onRetry={data.reload}
        selectedProjectId={selectedProjectId}
        selectedLandId={selectedLandId}
        onSelectProject={(id) => openProject(id, true)}
        onSelectLand={(id) => openLand(id, true)}
        user={user}
        isAdmin={isAdmin}
        busyDrawing={!!draw}
        onAddProject={startAddProject}
        onAddLand={startAddLand}
        onSignIn={() => setDialog('login')}
        onSignOut={async () => {
          await logout();
          toast('Signed out');
        }}
        onManageUsers={() => setDialog('users')}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        mobileOpen={mobileMenu}
        onMobileClose={() => setMobileMenu(false)}
      />

      <main className="relative min-w-0 flex-1">
        <MapView
          ref={mapRef}
          basemap={basemap}
          projects={visibleProjects}
          lands={mapLands}
          selectedProjectId={selectedProjectId}
          selectedLandId={selectedLandId}
          selection={draw ? null : selection}
          draw={draw}
          panelOpen={panelOpen}
          onMapClick={onMapClick}
          onProjectClick={(id) => openProject(id)}
          onLandClick={(id) => openLand(id)}
          onDrawChange={setDraw}
          onDrawFinish={finishDrawing}
        />

        {/* Top-left: menu (mobile) + basemap switch */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-2">
          <button
            type="button"
            onClick={() => setMobileMenu(true)}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-md bg-white shadow-float md:hidden"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
          <div className="pointer-events-auto flex rounded-md bg-white p-0.5 shadow-float" role="group" aria-label="Base map">
            {(['satellite', 'streets'] as const).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={basemap === b}
                onClick={() => setBasemap(b)}
                className={`rounded px-2.5 py-1 text-[13px] ${basemap === b ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
              >
                {b === 'satellite' ? 'Satellite' : 'Map'}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-9 left-3 z-10 hidden gap-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] text-ink-soft shadow-sm backdrop-blur sm:flex">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-balcony ring-2 ring-white" />Project</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm border border-ochre-deep/60 bg-ochre/50" />Land plot</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-white" />Selected point</span>
        </div>

        {/* Selected point chip (ordinary map click) */}
        {selection && !draw && panel.kind !== 'projectForm' && (
          <div className="panel-enter pointer-events-auto absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-1 pl-3 pr-1 text-[12.5px] shadow-float md:bottom-9">
            <span className="tabular-nums text-ink">{formatCoords(selection[1], selection[0])}</span>
            {isAdmin && (
              <button type="button" className="rounded-full bg-ink px-2.5 py-1 text-white hover:bg-ink/90" onClick={startAddProject}>
                Add project here
              </button>
            )}
            <button type="button" aria-label="Clear selected point" className="rounded-full px-2 py-1 text-ink-soft hover:bg-paper" onClick={() => setSelection(null)}>
              Clear
            </button>
          </div>
        )}

        {draw && <DrawToolbar draw={draw} onUndo={undo} onFinish={finishDrawing} onRemoveVertex={removeVertex} onCancel={cancelLand} />}

        {renderPanel()}
      </main>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)} />}
      {dialog === 'users' && isAdmin && <UsersDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
