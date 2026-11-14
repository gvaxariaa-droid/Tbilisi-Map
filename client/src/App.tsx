import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type DrawState, type LayerVisibility, type MapHandle } from './components/MapView.tsx';
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
import { DASH, formatCoords, formatPriceRange, formatUsdPerM2 } from './lib/format.ts';
import { currentPrices, distanceM, radiusStats } from './lib/prices.ts';
import { useI18n } from './lib/i18n.tsx';
import { FRAMES, projectColor } from './lib/types.ts';
import type { Basemap } from './lib/mapStyle.ts';
import type { Frame, LandInput, LngLat, ProjectInput } from './lib/types.ts';
import type { MultiPhotoValue } from './components/PhotoFields.tsx';

type Panel =
  | { kind: 'none' }
  | { kind: 'project'; id: string }
  | { kind: 'record'; id: string }
  | { kind: 'projectForm'; id?: string }
  | { kind: 'land'; id: string }
  | { kind: 'landForm'; id?: string };

const RADII = [500, 1000, 2000];
const radiusLabel = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

const LAYER_KEY = 'tpm.layers';
const DEFAULT_LAYERS: LayerVisibility = { projects: true, territories: true, land: true, labels: true };
function loadLayers(): LayerVisibility {
  try {
    const raw = localStorage.getItem(LAYER_KEY);
    return raw ? { ...DEFAULT_LAYERS, ...JSON.parse(raw) } : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function App() {
  const { user, checked, isAdmin, logout } = useAuth();
  const data = useData(user?.id ?? null, checked);
  const toast = useToast();
  const mapRef = useRef<MapHandle>(null);
  const { t } = useI18n();

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
  const [layers, setLayers] = useState<LayerVisibility>(loadLayers);
  const [radii, setRadii] = useState<number[]>([]);
  /** Frames included in the radius average. */
  const [radiusFrames, setRadiusFrames] = useState<Frame[]>(['black', 'white', 'green']);
  /** Territory of the project in the open form (committed when Done is pressed in the toolbar). */
  const [formArea, setFormArea] = useState<LngLat[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LAYER_KEY, JSON.stringify(layers));
    } catch {
      /* storage unavailable: toggles still work for this visit */
    }
  }, [layers]);

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
    setFormArea(null);
    setPanel({ kind: 'projectForm' });
    setMobileMenu(false);
  };

  const editProject = (id: string) => {
    const p = projectById(id);
    if (!p) return;
    setSelection([p.longitude, p.latitude]);
    setDraw(null);
    setFormArea(p.area ? fromPolygon(p.area) : null);
    setPanel({ kind: 'projectForm', id });
  };

  const saveProject = async (input: ProjectInput, photos: MultiPhotoValue, id?: string) => {
    let saved = id ? await api.updateProject(id, input) : await api.createProject(input);
    data.upsertProject(saved);
    const problems: string[] = [];
    for (const pid of photos.removedIds) {
      await api.deletePhoto(pid).catch((e: Error) => problems.push(e.message));
    }
    if (photos.added.length) {
      try {
        saved = await api.uploadProjectPhotos(saved.id, photos.added);
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    if (photos.removedIds.length && !photos.added.length) saved = await api.getProject(saved.id).catch(() => saved);
    data.upsertProject(saved);
    if (problems.length) toast(t('Project saved, but the photo was not: {error}', { error: problems.join(' ') }), 'error');
    else toast(id ? t('Project updated') : t('Project added'));
    data.refreshStats();
    setSelection(null);
    setFormArea(null);
    setDraw(null);
    setPanel({ kind: 'project', id: saved.id });
  };

  const deleteProject = (id: string) => {
    const p = projectById(id);
    if (!p) return;
    setConfirm({
      title: t('Delete project'),
      message: t('Delete "{name}", its photograph and price history? This cannot be undone.', { name: p.name }),
      confirmLabel: t('Delete project'),
      onConfirm: async () => {
        try {
          await api.deleteProject(id);
          data.removeProject(id);
          data.refreshStats();
          setPanel({ kind: 'none' });
          toast(t('Project deleted'));
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
    setDraw({ target: 'land', mode: 'draw', vertices: [], selected: null, history: [] });
    setMobileMenu(false);
  };

  const startDrawArea = () => {
    setDraw({ target: 'project', mode: formArea ? 'edit' : 'draw', vertices: formArea ?? [], selected: null, history: [] });
  };

  const doneArea = () => {
    if (draw && draw.vertices.length >= 3) setFormArea(draw.vertices);
    setDraw(null);
  };

  const finishDrawing = useCallback(() => {
    if (!draw || draw.vertices.length < 3) return;
    setDraw({ ...draw, mode: 'edit', selected: null });
    // A land plot opens its form once closed; a project territory stays with the open project form.
    if (draw.target === 'land') setPanel((p) => (p.kind === 'landForm' ? p : { kind: 'landForm' }));
  }, [draw]);

  const editLand = (id: string) => {
    const l = landById(id);
    if (!l) return;
    const vertices = fromPolygon(l.geometry);
    setDraw({ target: 'land', mode: 'edit', vertices, selected: null, history: [] });
    setPanel({ kind: 'landForm', id });
    mapRef.current?.fitPolygon(vertices);
  };

  const cancelLand = useCallback(() => {
    setDraw(null);
    setPanel((p) => (p.kind === 'landForm' && p.id ? { kind: 'land', id: p.id } : { kind: 'none' }));
  }, []);

  /** Esc / Cancel in the toolbar: a territory drawing returns to the form unchanged. */
  const cancelDraw = useCallback(() => {
    if (draw?.target === 'project') setDraw(null);
    else cancelLand();
  }, [draw, cancelLand]);

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
    if (problems.length) toast(t('Land saved, but some photo changes failed: {error}', { error: problems.join(' ') }), 'error');
    else toast(id ? t('Land plot updated') : t('Land plot saved'));
  };

  const deleteLand = (id: string) => {
    const l = landById(id);
    if (!l) return;
    setConfirm({
      title: t('Delete land plot'),
      message: t('Delete "{name}", its boundary, contacts and photographs? This cannot be undone.', { name: l.name }),
      confirmLabel: t('Delete land plot'),
      onConfirm: async () => {
        try {
          await api.deleteLand(id);
          data.removeLand(id);
          data.refreshStats();
          setPanel({ kind: 'none' });
          toast(t('Land plot deleted'));
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
      } else if (e.key === 'Escape' && !confirm && !dialog) cancelDraw();
      else if (e.key === 'Enter' && draw.mode === 'draw' && draw.vertices.length >= 3) finishDrawing();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && draw.mode === 'edit') {
        e.preventDefault();
        removeVertex();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw, undo, removeVertex, cancelDraw, finishDrawing, confirm, dialog]);

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
        return p ? (
          <ProjectRecord
            project={p}
            isAdmin={isAdmin}
            onBack={() => setPanel({ kind: 'project', id: p.id })}
            onClose={() => setPanel({ kind: 'none' })}
            onEditPrices={() => editProject(p.id)}
          />
        ) : null;
      }
      case 'projectForm': {
        const p = panel.id ? projectById(panel.id) : undefined;
        return (
          <ProjectForm
            key={panel.id ?? 'new'}
            project={p}
            selection={selection}
            onCoordsChange={setSelection}
            area={draw?.target === 'project' ? draw.vertices : formArea}
            drawingArea={draw?.target === 'project'}
            onDrawArea={startDrawArea}
            onClearArea={() => setFormArea(null)}
            onSave={(input, photos) => saveProject(input, photos, panel.id)}
            onCancel={() => {
              setSelection(null);
              setFormArea(null);
              setDraw(null);
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
        return draw?.target === 'land' ? (
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
    <div className="app-shell flex w-full overflow-hidden bg-paper text-ink">
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
          toast(t('Signed out'));
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
          pointDraggable={panel.kind === 'projectForm' && !draw}
          onPointDrag={setSelection}
          draw={draw}
          formArea={panel.kind === 'projectForm' ? formArea : null}
          editingProjectId={panel.kind === 'projectForm' ? (panel.id ?? null) : null}
          layers={layers}
          radius={selection && !draw && radii.length ? { center: selection, radii } : null}
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
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-md bg-surface text-ink shadow-float md:hidden"
            aria-label={t('Open menu')}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
          <div className="pointer-events-auto flex rounded-md bg-surface p-0.5 shadow-float" role="group" aria-label={t('Base map')}>
            {(['satellite', 'streets'] as const).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={basemap === b}
                onClick={() => setBasemap(b)}
                className={`rounded px-2.5 py-1 text-[13px] ${basemap === b ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'}`}
              >
                {b === 'satellite' ? t('Satellite') : t('Map')}
              </button>
            ))}
          </div>
        </div>

        {/* Layer toggles (they also act as the legend) */}
        <div className="pointer-events-auto absolute bottom-9 left-3 z-10 flex flex-wrap gap-1 rounded-md bg-surface/95 p-1 text-[12px] shadow-sm backdrop-blur" role="group" aria-label={t('Map layers')}>
          {(
            [
              ['projects', 'Projects', <span key="i" className="grid h-3.5 w-3.5 place-items-center rounded-full bg-balcony ring-2 ring-surface"><span className="h-1.5 w-1 rounded-[1px] border border-white" /></span>],
              ['territories', 'Project areas', <span key="i" className="h-2.5 w-3.5 rounded-sm border border-dashed border-balcony bg-balcony/25" />],
              ['land', 'Land', <span key="i" className="h-2.5 w-3.5 rounded-[1px] border-2 border-[#B86A1E] bg-[repeating-linear-gradient(135deg,#F3A55B_0_2px,transparent_2px_4px)]" />],
              ['labels', 'Labels', <span key="i" className="rounded-sm bg-surface px-0.5 text-[9px] font-semibold leading-none text-ink ring-1 ring-line">$</span>],
            ] as const
          ).map(([key, label, icon]) => {
            const on = layers[key];
            const disabled = key === 'labels' && !layers.land && !layers.projects;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                className={`flex items-center gap-1.5 rounded px-2 py-1 ${on && !disabled ? 'text-ink' : 'text-ink-faint line-through decoration-ink-faint/60'} hover:bg-paper disabled:cursor-not-allowed`}
                title={on ? t('Hide {layer}', { layer: t(label) }) : t('Show {layer}', { layer: t(label) })}
              >
                <span className={on && !disabled ? '' : 'opacity-40'}>{icon}</span>
                {t(label)}
              </button>
            );
          })}
        </div>

        {/* Selected point: coordinates, radius circles and nearby price averages */}
        {selection && !draw && panel.kind !== 'projectForm' && (
          <div className="panel-enter pointer-events-auto absolute bottom-[4.5rem] left-1/2 z-10 flex max-h-[55vh] w-[min(31rem,calc(100%-1.5rem))] -translate-x-1/2 flex-col rounded-lg bg-surface px-3 py-2 text-[12.5px] shadow-float md:bottom-[5.5rem]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="flex items-center gap-1.5 tabular-nums text-ink">
                <span className="h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-white" />
                {formatCoords(selection[1], selection[0])}
              </span>
              <span className="ml-auto flex gap-1">
                {isAdmin && (
                  <button type="button" className="rounded-full bg-ink px-2.5 py-1 text-surface hover:bg-ink/90" onClick={startAddProject}>
                    {t('Add project here')}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full px-2 py-1 text-ink-soft hover:bg-paper"
                  onClick={() => {
                    setSelection(null);
                    setRadii([]);
                  }}
                >
                  {t('Clear')}
                </button>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5">
              <span className="text-ink-soft">{t('Radius')}</span>
              {RADII.map((m) => {
                const on = radii.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRadii((r) => (on ? r.filter((x) => x !== m) : [...r, m].sort((a, b) => a - b)))}
                    className={`rounded-full px-2.5 py-0.5 ring-1 ring-inset ${on ? 'bg-signal text-white ring-signal' : 'text-ink-soft ring-line hover:text-ink'}`}
                  >
                    {radiusLabel(m)}
                  </button>
                );
              })}
            </div>
            {radii.length > 0 && (() => {
              const maxR = Math.max(...radii);
              const nearby = visibleProjects
                .map((p) => ({ p, d: distanceM(selection, [p.longitude, p.latitude]) }))
                .filter((x) => x.d <= maxR)
                .sort((a, b) => a.d - b.d);
              const cell = (v: number | null) => (v != null ? formatUsdPerM2(Math.round(v)).replace(' / m²', '') : DASH);
              return (
                <div className="mt-1.5 min-h-0 overflow-y-auto">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right tabular-nums">
                      <thead className="text-[11px] text-ink-faint">
                        <tr>
                          <th className="py-1 pr-2 text-left font-normal">{t('Within')}</th>
                          <th className="py-1 pr-2 font-normal">{t('Projects')}</th>
                          {FRAMES.map((f) => {
                            const on = radiusFrames.includes(f.value);
                            return (
                              <th key={f.value} className="py-1 pr-1 font-normal">
                                <button
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => setRadiusFrames((fs) => (on ? fs.filter((x) => x !== f.value) : [...fs, f.value]))}
                                  title={on ? t('Leave {frame} out of the average', { frame: t(f.label) }) : t('Include {frame} in the average', { frame: t(f.label) })}
                                  className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-paper ${on ? 'text-ink-soft' : 'text-ink-faint line-through'}`}
                                >
                                  <span className={`h-2.5 w-2.5 rounded-sm ring-1 ring-ink/25 ${on ? '' : 'opacity-30'}`} style={{ background: f.swatch }} />
                                  {t(f.short)}
                                </button>
                              </th>
                            );
                          })}
                          <th className="py-1 font-normal">{t('Average')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {radii.map((m) => {
                          const st = radiusStats(selection, m, visibleProjects, radiusFrames);
                          return (
                            <tr key={m} className="text-ink">
                              <td className="py-1 pr-2 text-left">{radiusLabel(m)}</td>
                              <td className="py-1 pr-2">{st.projectCount}</td>
                              {FRAMES.map((f) => (
                                <td
                                  key={f.value}
                                  className={`py-1 pr-2 ${radiusFrames.includes(f.value) ? '' : 'text-ink-faint/60'}`}
                                  title={t('{n} projects with this price', { n: st.byFrame[f.value].n })}
                                >
                                  {cell(st.byFrame[f.value].avg)}
                                </td>
                              ))}
                              <td className="py-1 font-semibold">{cell(st.overall)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {t('Average current price per m² of the projects shown on the map. Ranges count as their midpoint. Click a frame to include it in or leave it out of the average.')}
                  </p>
                  {nearby.length > 0 && (
                    <ul className="mt-1.5 divide-y divide-line border-t border-line">
                      {nearby.map(({ p, d }) => {
                        const cur = currentPrices(p);
                        const shown = FRAMES.filter((f) => radiusFrames.includes(f.value) && cur[f.value]);
                        return (
                          <li key={p.id}>
                            <button type="button" onClick={() => openProject(p.id, true)} className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-paper">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface" style={{ background: projectColor(p.color).pin }} />
                              <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                              <span className="shrink-0 text-[11.5px] tabular-nums text-ink-soft">
                                {shown.map((f) => (
                                  <span key={f.value} className="ml-2 inline-flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-sm ring-1 ring-ink/25" style={{ background: f.swatch }} />
                                    {formatPriceRange(cur[f.value]!.min, cur[f.value]!.max, false)}
                                  </span>
                                ))}
                              </span>
                              <span className="w-12 shrink-0 text-right text-[11.5px] tabular-nums text-ink-faint">
                                {d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {draw && (
          <DrawToolbar
            draw={draw}
            onUndo={undo}
            onFinish={finishDrawing}
            onRemoveVertex={removeVertex}
            onCancel={cancelDraw}
            onDone={draw.target === 'project' ? doneArea : undefined}
          />
        )}

        {renderPanel()}
      </main>

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
      {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)} />}
      {dialog === 'users' && isAdmin && <UsersDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
