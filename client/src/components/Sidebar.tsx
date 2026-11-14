import { useMemo, type ReactNode } from 'react';
import type { LandPlot, Project, Stats, User } from '../lib/types.ts';
import { FRAMES, STAGES, landColor, projectColor, stageLabel } from '../lib/types.ts';
import { priceSpan } from '../lib/prices.ts';
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
import { DASH, formatArea, formatPriceRange, formatUsd, formatUsdPerM2 } from '../lib/format.ts';
import { useI18n, useTheme, type Lang } from '../lib/i18n.tsx';
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

/** Georgian flag: white field, red St George's cross, four red Bolnur-Katskhuri crosses. */
function FlagGE() {
  const small = (cx: number, cy: number) => (
    <path d={`M${cx - 1.6} ${cy}h3.2M${cx} ${cy - 1.6}v3.2`} stroke="#E8112D" strokeWidth="1.1" />
  );
  return (
    <svg viewBox="0 0 30 20" className="h-3 w-[18px] rounded-[2px] ring-1 ring-ink/20" aria-hidden>
      <rect width="30" height="20" fill="#fff" />
      <path d="M15 0v20M0 10h30" stroke="#E8112D" strokeWidth="4" />
      {small(7.5, 5)}
      {small(22.5, 5)}
      {small(7.5, 15)}
      {small(22.5, 15)}
    </svg>
  );
}

/** Union flag, simplified for a small size. */
function FlagGB() {
  return (
    <svg viewBox="0 0 30 20" className="h-3 w-[18px] rounded-[2px] ring-1 ring-ink/20" aria-hidden>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#C8102E" strokeWidth="1.5" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.4" />
    </svg>
  );
}

/** Sun/moon switch and GEO/ENG switch. */
function Preferences() {
  const { lang, setLang, t } = useI18n();
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const langs: { value: Lang; label: string; flag: ReactNode }[] = [
    { value: 'ka', label: 'GEO', flag: <FlagGE /> },
    { value: 'en', label: 'ENG', flag: <FlagGB /> },
  ];
  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        title={dark ? t('Switch to light theme') : t('Switch to dark theme')}
        aria-label={dark ? t('Switch to light theme') : t('Switch to dark theme')}
        className="relative flex h-7 w-[3.25rem] shrink-0 items-center rounded-full bg-paper ring-1 ring-inset ring-line"
      >
        <span
          className={`absolute top-0.5 grid h-6 w-6 place-items-center rounded-full bg-surface shadow-sm transition-[left] ${dark ? 'left-[1.625rem]' : 'left-0.5'}`}
        >
          {dark ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-balcony" aria-hidden>
              <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ochre" aria-hidden>
              <circle cx="8" cy="8" r="3" fill="currentColor" />
              <path
                d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
      </button>
      <div className="ml-auto flex rounded-md bg-paper p-0.5 ring-1 ring-inset ring-line" role="group" aria-label={t('Language')}>
        {langs.map((l) => (
          <button
            key={l.value}
            type="button"
            aria-pressed={lang === l.value}
            onClick={() => setLang(l.value)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11.5px] font-semibold tracking-wide ${
              lang === l.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink'
            }`}
          >
            {l.flag}
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeInputs({ label, min, max, onMin, onMax, unit }: { label: string; min: string; max: string; onMin(v: string): void; onMax(v: string): void; unit: string }) {
  const { t } = useI18n();
  return (
    <div>
      <span className="mb-1 block text-[12px] text-ink-soft">
        {label} <span className="text-ink-faint">({unit})</span>
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        <input className={`${inputClass} h-8 py-1 tabular-nums`} inputMode="decimal" placeholder={t('Min')} aria-label={`${label} ${t('Min')}`} value={min} onChange={(e) => onMin(e.target.value)} />
        <input className={`${inputClass} h-8 py-1 tabular-nums`} inputMode="decimal" placeholder={t('Max')} aria-label={`${label} ${t('Max')}`} value={max} onChange={(e) => onMax(e.target.value)} />
      </div>
    </div>
  );
}

function Details({ title, count, children, onClear }: { title: string; count: number; children: ReactNode; onClear(): void }) {
  const { t } = useI18n();
  return (
    <details className="group rounded-md border border-line bg-surface" open={count > 0 || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[13px] font-medium text-ink">
        <span>
          {title}
          {count > 0 && <span className="ml-1.5 rounded-full bg-ink px-1.5 text-[11px] text-surface">{count}</span>}
        </span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink-faint transition-transform group-open:rotate-180" aria-hidden>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">
        {children}
        <Button size="sm" variant="ghost" className="-ml-2" onClick={onClear} disabled={count === 0}>
          {t('Clear filters')}
        </Button>
      </div>
    </details>
  );
}

function ListHeader({ shown, total, one, many }: { shown: number; total: number; one: string; many: string }) {
  const { t } = useI18n();
  return (
    <p className="min-w-0 whitespace-nowrap text-[12px] text-ink-soft">
      {shown === total
        ? t(total === 1 ? one : many, { n: total })
        : t('Showing {shown} of {total}', { shown, total })}
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-3 py-4 text-[13px] leading-relaxed text-ink-soft">{children}</p>;
}

function ProjectsTab(p: Props) {
  const { t } = useI18n();
  const f = p.projectFilters;
  const set = (patch: Partial<ProjectFilters>) => p.onProjectFilters({ ...f, ...patch });
  const developers = useMemo(() => [...new Set(p.projects.map((x) => x.developer))].sort((a, b) => a.localeCompare(b)), [p.projects]);
  return (
    <div className="space-y-3">
      <Details title={t('Project filters')} count={countActiveProjectFilters(f)} onClear={() => p.onProjectFilters(emptyProjectFilters)}>
        <div>
          <span className="mb-1 block text-[12px] text-ink-soft">{t('Construction stage')}</span>
          <div className="flex flex-wrap gap-1">
            {STAGES.map((s) => {
              const on = f.stages.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ stages: on ? f.stages.filter((x) => x !== s.value) : [...f.stages, s.value] })}
                  className={`rounded-full px-2.5 py-1 text-[12px] ring-1 ring-inset ${on ? 'bg-balcony text-white ring-balcony' : 'bg-surface text-ink-soft ring-line hover:text-ink'}`}
                >
                  {t(s.label)}
                </button>
              );
            })}
          </div>
        </div>
        <RangeInputs label={t('Price per m²')} unit="USD" min={f.minPrice} max={f.maxPrice} onMin={(v) => set({ minPrice: v })} onMax={(v) => set({ maxPrice: v })} />
        <label className="block">
          <span className="mb-1 block text-[12px] text-ink-soft">{t('Developer')}</span>
          <select className={`${inputClass} h-8 py-1`} value={f.developer} onChange={(e) => set({ developer: e.target.value })}>
            <option value="">{t('All developers')}</option>
            {developers.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </Details>

      <ListHeader shown={p.visibleProjects.length} total={p.projects.length} one="{n} project" many="{n} projects" />
      {p.projects.length === 0 && !p.loading ? (
        <Empty>{p.isAdmin ? t('No projects yet. Use Add project, then click the map where the building stands.') : t('No projects have been published yet.')}</Empty>
      ) : (
        <ul className="space-y-1">
          {p.visibleProjects.map((x) => {
            const span = priceSpan(x);
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => p.onSelectProject(x.id)}
                  className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface ${x.id === p.selectedProjectId ? 'bg-surface ring-1 ring-balcony/40' : ''}`}
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface" style={{ background: projectColor(x.color).pin }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{x.name}</span>
                    <span className="block truncate text-[12px] text-ink-soft">
                      {x.developer}, {t(stageLabel(x.construction_stage)).toLowerCase()}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-soft">
                    {span ? formatPriceRange(span.lo, span.hi === span.lo ? null : span.hi) : ''}
                  </span>
                </button>
              </li>
            );
          })}
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
  const { t } = useI18n();
  const f = p.landFilters;
  const set = (patch: Partial<LandFilters>) => p.onLandFilters({ ...f, ...patch });
  const signedIn = !!p.user;
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <input
          className={`${inputClass} h-8 min-w-0 flex-1 py-1`}
          placeholder={signedIn ? t('Name, code, owner, agent') : t('Plot name or cadastral code')}
          aria-label={t('Search land inventory')}
          value={f.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        {signedIn && (
          <select className={`${inputClass} h-8 shrink-0 py-1`} style={{ width: '6.5rem' }} aria-label={t('Search in')} value={f.field} onChange={(e) => set({ field: e.target.value as LandField })}>
            <option value="all">{t('All')}</option>
            <option value="name">{t('Name')}</option>
            <option value="owner">{t('Owner')}</option>
            <option value="agent">{t('Agent')}</option>
          </select>
        )}
      </div>
      <Details title={t('Land filters')} count={countActiveLandFilters({ ...f, query: '' })} onClear={() => p.onLandFilters({ ...emptyLandFilters, sort: f.sort })}>
        <RangeInputs label={t('Area')} unit="m²" min={f.minArea} max={f.maxArea} onMin={(v) => set({ minArea: v })} onMax={(v) => set({ maxArea: v })} />
        <RangeInputs label={t('Total price')} unit="USD" min={f.minTotal} max={f.maxTotal} onMin={(v) => set({ minTotal: v })} onMax={(v) => set({ maxTotal: v })} />
        <RangeInputs label={t('Price per m²')} unit="USD" min={f.minPpm} max={f.maxPpm} onMin={(v) => set({ minPpm: v })} onMax={(v) => set({ maxPpm: v })} />
        <RangeInputs label={t('K2 coefficient')} unit={t('ratio')} min={f.minK2} max={f.maxK2} onMin={(v) => set({ minK2: v })} onMax={(v) => set({ maxK2: v })} />
      </Details>
      <div className="flex items-center justify-between gap-2">
        <ListHeader shown={p.visibleLands.length} total={p.lands.length} one="{n} plot" many="{n} plots" />
        <select className={`${inputClass} h-7 shrink-0 py-0 text-[12px]`} style={{ width: 'auto' }} aria-label={t('Sort land plots')} value={f.sort} onChange={(e) => set({ sort: e.target.value as LandSort })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.label)}
            </option>
          ))}
        </select>
      </div>
      {p.lands.length === 0 && !p.loading ? (
        <Empty>{p.isAdmin ? t('No land plots yet. Use Add land and click the corners of the plot on the map.') : t('No land plots have been published yet.')}</Empty>
      ) : (
        <ul className="space-y-1">
          {p.visibleLands.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => p.onSelectLand(l.id)}
                className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface ${l.id === p.selectedLandId ? 'bg-surface ring-1 ring-ochre/60' : ''} ${l.deal_status ? 'opacity-60' : ''}`}
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rotate-45"
                  style={
                    l.deal_status
                      ? { background: '#B9C0C4', boxShadow: '0 0 0 1px #8A9399' }
                      : { background: landColor(l.color).fill, boxShadow: `0 0 0 1px ${landColor(l.color).line}` }
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium text-ink">{l.name}</span>
                    {l.deal_status && (
                      <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ${l.deal_status === 'sold' ? 'bg-signal/15 text-signal' : 'bg-ink/10 text-ink-soft'}`}>
                        {l.deal_status === 'sold' ? t('SOLD') : t('Not interested')}
                      </span>
                    )}
                    {l.seen_status && (
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${l.seen_status === 'seen' ? 'bg-[#2E9D57]' : 'bg-signal'}`}
                        title={l.seen_status === 'seen' ? t('Seen') : t('Not seen')}
                      />
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {formatArea(l.area_m2, false)}
                    {l.cadastral_code ? `, ${l.cadastral_code}` : ''}
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
    <div className={`border-l-2 ${bar} bg-surface px-3 py-2`}>
      <p className="text-[12px] text-ink-soft">{label}</p>
      <p className="text-[17px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function OverviewTab({ stats }: Props) {
  const { t } = useI18n();
  if (!stats) return <Empty>{t('Statistics will appear once data has loaded.')}</Empty>;
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{t('Development projects')}</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <Stat tone="project" label={t('Projects')} value={String(stats.project_count)} />
          <Stat tone="project" label={t('Average price, all frames')} value={stats.avg_project_price_per_m2_usd != null ? formatUsdPerM2(stats.avg_project_price_per_m2_usd) : DASH} />
          <Stat tone="project" label={t('Under construction')} value={String(stats.under_construction_count)} />
          <Stat tone="project" label={t('Completed')} value={String(stats.completed_count)} />
        </div>
        <ul className="mt-1.5 divide-y divide-line rounded bg-surface px-3">
          {FRAMES.map((f) => {
            const v = stats[`avg_${f.value}_frame_usd` as const];
            return (
              <li key={f.value} className="flex items-center justify-between py-1.5 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-ink/25" style={{ background: f.swatch }} />
                  {t('{frame}, average', { frame: t(f.label) })}
                </span>
                <span className="font-semibold tabular-nums text-ink">{v != null ? formatUsdPerM2(v) : DASH}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{t('Land')}</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <Stat tone="land" label={t('Land plots')} value={String(stats.land_count)} />
          <Stat tone="land" label={t('Average price')} value={stats.avg_land_price_per_m2_usd != null ? formatUsdPerM2(stats.avg_land_price_per_m2_usd) : DASH} />
          <div className="col-span-2">
            <Stat tone="land" label={t('Total registered area')} value={formatArea(stats.total_land_area_m2)} />
          </div>
        </div>
      </section>
      <p className="text-[11.5px] leading-relaxed text-ink-faint">
        {t('Counted from every saved record, not just the filtered view. Under construction covers facade works, both construction stages, exterior finishing and partly completed projects. Averages use each project’s current price; a price range counts as its midpoint.')}
      </p>
    </div>
  );
}

export default function Sidebar(p: Props) {
  const { t } = useI18n();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'projects', label: t('Projects') },
    { id: 'land', label: t('Land inventory') },
    { id: 'overview', label: t('Statistics') },
  ];

  if (p.collapsed) {
    return (
      <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-line bg-paper py-3 md:flex">
        <Logo />
        <button type="button" onClick={() => p.onCollapse(false)} className="rounded-md p-2 text-ink-soft hover:bg-ink/5" aria-label={t('Expand sidebar')} title={t('Expand sidebar')}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
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
            <p className="text-[11.5px] text-ink-faint">{t('Projects and land across the city')}</p>
          </div>
          <button type="button" onClick={() => p.onCollapse(true)} className="hidden rounded-md p-1.5 text-ink-soft hover:bg-ink/5 md:block" aria-label={t('Collapse sidebar')} title={t('Collapse sidebar')}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
          <button type="button" onClick={p.onMobileClose} className="rounded-md p-1.5 text-ink-soft hover:bg-ink/5 md:hidden" aria-label={t('Close menu')}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
            </svg>
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
              placeholder={p.user ? t('Search projects, developers, plots, owners, agents') : t('Search projects, developers, land plots')}
              aria-label={t('Search everything')}
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        <nav className="mt-3 flex gap-1 border-b border-line px-3" role="tablist">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={p.tab === tb.id}
              type="button"
              onClick={() => p.onTab(tb.id)}
              className={`-mb-px border-b-2 px-2 pb-2 pt-1 text-[13px] font-medium ${
                p.tab === tb.id ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {p.error ? (
            <div className="rounded-md bg-signal/10 px-3 py-3 text-[13px] text-signal">
              <p>{t('Could not load data: {error}', { error: p.error })}</p>
              <Button size="sm" className="mt-2" onClick={p.onRetry}>
                {t('Try again')}
              </Button>
            </div>
          ) : p.tab === 'projects' ? (
            <ProjectsTab {...p} />
          ) : p.tab === 'land' ? (
            <LandTab {...p} />
          ) : (
            <OverviewTab {...p} />
          )}
          {p.loading && <p className="mt-2 text-[12px] text-ink-faint">{t('Loading records…')}</p>}
        </div>

        {p.isAdmin && (
          <div className="grid grid-cols-2 gap-2 border-t border-line px-4 py-3">
            <Button variant="primary" onClick={p.onAddProject} disabled={p.busyDrawing}>
              <span className="h-2.5 w-2.5 rounded-full bg-balcony ring-2 ring-surface" /> {t('Add project')}
            </Button>
            <Button variant="land" onClick={p.onAddLand} disabled={p.busyDrawing}>
              <span className="h-2.5 w-2.5 rotate-45 bg-[#1B2830]/80" /> {t('Add land')}
            </Button>
          </div>
        )}

        <Preferences />

        <footer className="flex items-center gap-2 border-t border-line px-4 py-3 text-[13px]">
          {p.user ? (
            <>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-surface">
                {p.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{p.user.name}</span>
                <span className="block text-[11.5px] text-ink-faint">{p.user.role === 'admin' ? t('Administrator') : t('Viewer')}</span>
              </span>
              {p.isAdmin && (
                <Button size="sm" variant="ghost" onClick={p.onManageUsers}>
                  {t('Users')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={p.onSignOut}>
                {t('Sign out')}
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-[12px] text-ink-faint">{t('Viewing the public map')}</span>
              <Button size="sm" onClick={p.onSignIn}>
                {t('Sign in')}
              </Button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
