import { useMemo, type ReactNode } from 'react';
import type { LandPlot, Project, Stats, User } from '../lib/types.ts';
import { STAGES, stageLabel } from '../lib/types.ts';
import {
  countActiveLandFilters,
  countActiveProjectFilters,
  emptyLandFilters,
  emptyProjectFilters,
  type LandField,
  type LandFilters,
  type LandSort,
  type ProjectFilters,
} from '../lib/filters.ts';
import { DASH, formatArea, formatUsd, formatUsdPerM2 } from '../lib/format.ts';
import { Button, inputClass } from './ui.tsx';

export type Tab = 'projects' | 'land' | 'overview';

interface Props {
  tab: Tab;
  onTab(t: Tab): void;
  search: string;
  onSearch(s: string): void;
  projects: Project[];
  visibleProjects: Project[];
  lands: LandPlot[];
  visibleLands: LandPlot[];
  projectFilters: ProjectFilters;
  onProjectFilters(f: ProjectFilters): void;
  landFilters: LandFilters;
  onLandFilters(f: LandFilters): void;
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  onRetry(): void;
  selectedProjectId: string | null;
  selectedLandId: string | null;
  onSelectProject(id: string): void;
  onSelectLand(id: string): void;
  user: User | null;
  isAdmin: boolean;
  busyDrawing: boolean;
  onAddProject(): void;
  onAddLand(): void;
  onSignIn(): void;
  onSignOut(): void;
  onManageUsers(): void;
  collapsed: boolean;
  onCollapse(c: boolean): void;
  mobileOpen: boolean;
  onMobileClose(): void;
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#1B2830" />
      <path d="M7 21 L13 9 L21 12 L25 22 Z" fill="#D99A1E" fillOpacity=".85" stroke="#FBF0DA" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="13" cy="17" r="3.6" fill="#1F5FA8" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

function RangeInputs({ label, min, max, onMin, onMax, unit }: { label: string; min: string; max: string; onMin(v: string): void; onMax(v: string): void; unit: string }) {
  return (
    <div>
      <span className="mb-1 block text-[12px] text-ink-soft">
        {label} <span className="text-ink-faint">({unit})</span>
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        <input className={`${inputClass} h-8 py-1 tabular-nums`} inputMode="decimal" placeholder="Min" aria-label={`${label} minimum`} value={min} onChange={(e) => onMin(e.target.value)} />
        <input className={`${inputClass} h-8 py-1 tabular-nums`} inputMode="decimal" placeholder="Max" aria-label={`${label} maximum`} value={max} onChange={(e) => onMax(e.target.value)} />
      </div>
    </div>
  );
}

function Details({ title, count, children, onClear }: { title: string; count: number; children: ReactNode; onClear(): void }) {
  return (
    <details className="group rounded-md border border-line bg-white" open={count > 0 || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-medium text-ink">
        <span>
          {title}
          {count > 0 && <span className="ml-1.5 rounded-full bg-ink px-1.5 text-[11px] text-white">{count}</span>}
        </span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink-faint transition-transform group-open:rotate-180" aria-hidden>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">
        {children}
        <Button size="sm" variant="ghost" className="-ml-2" onClick={onClear} disabled={count === 0}>
          Clear filters
        </Button>
      </div>
    </details>
  );
}

function ProjectsTab(p: Props) {
  const f = p.projectFilters;
  const set = (patch: Partial<ProjectFilters>) => p.onProjectFilters({ ...f, ...patch });
  const developers = useMemo(() => [...new Set(p.projects.map((x) => x.developer))].sort((a, b) => a.localeCompare(b)), [p.projects]);
  return (
    <div className="space-y-3">
      <Details title="Project filters" count={countActiveProjectFilters(f)} onClear={() => p.onProjectFilters(emptyProjectFilters)}>
        <div>
          <span className="mb-1 block text-[12px] text-ink-soft">Construction stage</span>
          <div className="flex flex-wrap gap-1">
            {STAGES.map((s) => {
              const on = f.stages.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ stages: on ? f.stages.filter((x) => x !== s.value) : [...f.stages, s.value] })}
                  className={`rounded-full px-2.5 py-1 text-[12px] ring-1 ring-inset ${on ? 'bg-balcony text-white ring-balcony' : 'bg-white text-ink-soft ring-line hover:text-ink'}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <RangeInputs label="Price per m²" unit="USD" min={f.minPrice} max={f.maxPrice} onMin={(v) => set({ minPrice: v })} onMax={(v) => set({ maxPrice: v })} />
        <label className="block">
          <span className="mb-1 block text-[12px] text-ink-soft">Developer</span>
          <select className={`${inputClass} h-8 py-1`} value={f.developer} onChange={(e) => set({ developer: e.target.value })}>
            <option value="">All developers</option>
            {developers.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </Details>

      <ListHeader shown={p.visibleProjects.length} total={p.projects.length} noun="projects" />
      {p.projects.length === 0 && !p.loading ? (
        <Empty>{p.isAdmin ? 'No projects yet. Use Add project, then click the map where the building stands.' : 'No projects have been published yet.'}</Empty>
      ) : (
        <ul className="space-y-1">
          {p.visibleProjects.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => p.onSelectProject(x.id)}
                className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white ${x.id === p.selectedProjectId ? 'bg-white ring-1 ring-balcony/40' : ''}`}
              >
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-balcony ring-2 ring-white" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{x.name}</span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {x.developer}, {stageLabel(x.construction_stage).toLowerCase()}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-ink-soft">{x.price_per_m2_usd != null ? formatUsdPerM2(x.price_per_m2_usd) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SORTS: { value: LandSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_desc', label: 'Price, high to low' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'area_desc', label: 'Area, largest first' },
  { value: 'area_asc', label: 'Area, smallest first' },
  { value: 'ppm_desc', label: 'Price per m², high to low' },
  { value: 'ppm_asc', label: 'Price per m², low to high' },
];

function LandTab(p: Props) {
  const f = p.landFilters;
  const set = (patch: Partial<LandFilters>) => p.onLandFilters({ ...f, ...patch });
  const signedIn = !!p.user;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <input
          className={`${inputClass} h-8 min-w-0 flex-1 py-1`}
          placeholder={signedIn ? 'Search land inventory' : 'Search by plot name'}
          aria-label="Search land inventory"
          value={f.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        {signedIn && (
          <select className={`${inputClass} h-8 w-[5.8rem] py-1`} aria-label="Search in" value={f.field} onChange={(e) => set({ field: e.target.value as LandField })}>
            <option value="all">All</option>
            <option value="name">Name</option>
            <option value="owner">Owner</option>
            <option value="agent">Agent</option>
          </select>
        )}
      </div>
      <Details title="Land filters" count={countActiveLandFilters({ ...f, query: '' })} onClear={() => p.onLandFilters({ ...emptyLandFilters, sort: f.sort })}>
        <RangeInputs label="Area" unit="m²" min={f.minArea} max={f.maxArea} onMin={(v) => set({ minArea: v })} onMax={(v) => set({ maxArea: v })} />
        <RangeInputs label="Total price" unit="USD" min={f.minTotal} max={f.maxTotal} onMin={(v) => set({ minTotal: v })} onMax={(v) => set({ maxTotal: v })} />
        <RangeInputs label="Price per m²" unit="USD" min={f.minPpm} max={f.maxPpm} onMin={(v) => set({ minPpm: v })} onMax={(v) => set({ maxPpm: v })} />
        <RangeInputs label="K2 coefficient" unit="ratio" min={f.minK2} max={f.maxK2} onMin={(v) => set({ minK2: v })} onMax={(v) => set({ maxK2: v })} />
      </Details>
      <div className="flex items-center justify-between gap-2">
        <ListHeader shown={p.visibleLands.length} total={p.lands.length} noun="plots" />
        <select className={`${inputClass} h-7 w-auto py-0 text-[12px]`} aria-label="Sort land plots" value={f.sort} onChange={(e) => set({ sort: e.target.value as LandSort })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      {p.lands.length === 0 && !p.loading ? (
        <Empty>{p.isAdmin ? 'No land plots yet. Use Add land and click the corners of the plot on the map.' : 'No land plots have been published yet.'}</Empty>
      ) : (
        <ul className="space-y-1">
          {p.visibleLands.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => p.onSelectLand(l.id)}
                className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white ${l.id === p.selectedLandId ? 'bg-white ring-1 ring-ochre/60' : ''}`}
              >
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rotate-45 bg-ochre ring-1 ring-ochre-deep/40" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{l.name}</span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {formatArea(l.area_m2, false)}
                    {l.k2_coefficient != null ? `, K2 ${l.k2_coefficient}` : ''}
                    {signedIn && l.owner_name ? `, ${l.owner_name}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12px] tabular-nums">
                  <span className="block text-ink">{formatUsd(l.total_price_usd)}</span>
                  <span className="block text-ink-faint">{l.price_per_m2_usd != null ? formatUsdPerM2(l.price_per_m2_usd) : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'project' | 'land' }) {
  const bar = tone === 'project' ? 'border-balcony' : tone === 'land' ? 'border-ochre' : 'border-line';
  return (
    <div className={`border-l-2 ${bar} bg-white px-3 py-2`}>
      <p className="text-[12px] text-ink-soft">{label}</p>
      <p className="text-[17px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function OverviewTab({ stats }: Props) {
  if (!stats) return <Empty>Statistics will appear once data has loaded.</Empty>;
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Development projects</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <Stat tone="project" label="Projects" value={String(stats.project_count)} />
          <Stat tone="project" label="Average price" value={stats.avg_project_price_per_m2_usd != null ? formatUsdPerM2(stats.avg_project_price_per_m2_usd) : DASH} />
          <Stat tone="project" label="Under construction" value={String(stats.under_construction_count)} />
          <Stat tone="project" label="Completed" value={String(stats.completed_count)} />
        </div>
      </section>
      <section>
        <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Land</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <Stat tone="land" label="Land plots" value={String(stats.land_count)} />
          <Stat tone="land" label="Average price" value={stats.avg_land_price_per_m2_usd != null ? formatUsdPerM2(stats.avg_land_price_per_m2_usd) : DASH} />
          <div className="col-span-2">
            <Stat tone="land" label="Total registered area" value={formatArea(stats.total_land_area_m2)} />
          </div>
        </div>
      </section>
      <p className="text-[11.5px] leading-relaxed text-ink-faint">
        Counted from every saved record, not just the filtered view. Under construction covers the construction, structure, facade and
        interior works stages; completed includes delivered. Averages are simple means of records that have a price.
      </p>
    </div>
  );
}

function ListHeader({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return (
    <p className="text-[12px] text-ink-soft">
      {shown === total ? `${total} ${noun}` : `Showing ${shown} of ${total} ${noun}`}
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-3 py-4 text-[13px] leading-relaxed text-ink-soft">{children}</p>;
}

export default function Sidebar(p: Props) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'projects', label: 'Projects' },
    { id: 'land', label: 'Land inventory' },
    { id: 'overview', label: 'Statistics' },
  ];

  if (p.collapsed) {
    return (
      <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-line bg-paper py-3 md:flex">
        <Logo />
        <button type="button" onClick={() => p.onCollapse(false)} className="rounded-md p-2 text-ink-soft hover:bg-ink/5" aria-label="Expand sidebar" title="Expand sidebar">
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
        </button>
      </aside>
    );
  }

  return (
    <>
      {p.mobileOpen && <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={p.onMobileClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(340px,88vw)] shrink-0 flex-col border-r border-line bg-paper transition-transform md:static md:z-auto md:w-[340px] md:translate-x-0 ${
          p.mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <Logo />
          <div className="min-w-0 flex-1">
            <h1 className="font-[650] leading-tight tracking-tight text-ink [font-stretch:112%]">Tbilisi Property Map</h1>
            <p className="text-[11.5px] text-ink-faint">Projects and land across the city</p>
          </div>
          <button type="button" onClick={() => p.onCollapse(true)} className="hidden rounded-md p-1.5 text-ink-soft hover:bg-ink/5 md:block" aria-label="Collapse sidebar" title="Collapse sidebar">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
          </button>
          <button type="button" onClick={p.onMobileClose} className="rounded-md p-1.5 text-ink-soft hover:bg-ink/5 md:hidden" aria-label="Close menu">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </header>

        <div className="px-4">
          <div className="relative">
            <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <input
              type="search"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              placeholder={p.user ? 'Search projects, developers, plots, owners, agents' : 'Search projects, developers, land plots'}
              aria-label="Search everything"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        <nav className="mt-3 flex gap-1 border-b border-line px-3" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={p.tab === t.id}
              type="button"
              onClick={() => p.onTab(t.id)}
              className={`-mb-px border-b-2 px-2 pb-2 pt-1 text-[13px] font-medium ${
                p.tab === t.id ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {p.error ? (
            <div className="rounded-md bg-signal/10 px-3 py-3 text-[13px] text-signal">
              <p>Could not load data: {p.error}</p>
              <Button size="sm" className="mt-2" onClick={p.onRetry}>Try again</Button>
            </div>
          ) : p.tab === 'projects' ? (
            <ProjectsTab {...p} />
          ) : p.tab === 'land' ? (
            <LandTab {...p} />
          ) : (
            <OverviewTab {...p} />
          )}
          {p.loading && <p className="mt-2 text-[12px] text-ink-faint">Loading records…</p>}
        </div>

        {p.isAdmin && (
          <div className="grid grid-cols-2 gap-2 border-t border-line px-4 py-3">
            <Button variant="primary" onClick={p.onAddProject} disabled={p.busyDrawing}>
              <span className="h-2.5 w-2.5 rounded-full bg-balcony ring-2 ring-white" /> Add project
            </Button>
            <Button variant="land" onClick={p.onAddLand} disabled={p.busyDrawing}>
              <span className="h-2.5 w-2.5 rotate-45 bg-ink/80" /> Add land
            </Button>
          </div>
        )}

        <footer className="flex items-center gap-2 border-t border-line px-4 py-3 text-[13px]">
          {p.user ? (
            <>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">
                {p.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{p.user.name}</span>
                <span className="block text-[11.5px] text-ink-faint">{p.user.role === 'admin' ? 'Administrator' : 'Viewer'}</span>
              </span>
              {p.isAdmin && <Button size="sm" variant="ghost" onClick={p.onManageUsers}>Users</Button>}
              <Button size="sm" variant="ghost" onClick={p.onSignOut}>Sign out</Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[12px] text-ink-faint">Viewing the public map</span>
              <Button size="sm" onClick={p.onSignIn}>Sign in</Button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
