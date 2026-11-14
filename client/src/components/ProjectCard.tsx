import { useState } from 'react';
import type { Frame, PriceEntry, Project } from '../lib/types.ts';
import { FRAMES, STAGES, projectColor, stageIndex, stageLabel } from '../lib/types.ts';
import { currentPrices, frameSeries, frameTrend, midpoint, stepChange } from '../lib/prices.ts';
import { photoUrl } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { DASH, formatArea, formatCoords, formatDate, formatDateTime, formatPriceRange, formatUsd } from '../lib/format.ts';
import { Button, CloseButton, Panel, Row } from './ui.tsx';

function PhotoOrPlaceholder({ id, alt }: { id: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();
  if (!id || failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-[repeating-linear-gradient(135deg,rgb(var(--paper))_0_10px,rgb(var(--line)/.6)_10px_20px)]">
        <span className="rounded bg-surface/80 px-2 py-0.5 text-xs text-ink-faint">{t('No photograph yet')}</span>
      </div>
    );
  }
  return <img src={photoUrl(id)} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />;
}

/** Cover photo with a thumbnail strip when the project has several photos. */
function Gallery({ project }: { project: Project }) {
  const { t } = useI18n();
  const ids = project.photo_ids?.length ? project.photo_ids : project.photo_id ? [project.photo_id] : [];
  const [i, setI] = useState(0);
  const current = ids[Math.min(i, ids.length - 1)] ?? null;
  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-md">
        <PhotoOrPlaceholder key={current ?? 'none'} id={current} alt={project.name} />
      </div>
      {ids.length > 1 && (
        <div className="mt-1.5 flex gap-1 overflow-x-auto">
          {ids.map((id, n) => (
            <button
              key={id}
              type="button"
              onClick={() => setI(n)}
              aria-label={t('Photo {n}', { n: n + 1 })}
              className={`h-11 w-16 shrink-0 overflow-hidden rounded ${n === i ? 'ring-2 ring-balcony' : 'opacity-70 hover:opacity-100'}`}
            >
              <img src={photoUrl(id)} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Construction stages are a real sequence, so the card shows where the build is. */
export function StageMeter({ project }: { project: Project }) {
  const { t } = useI18n();
  const at = stageIndex(project.construction_stage);
  const pin = projectColor(project.color).pin;
  return (
    <div>
      <div className="flex gap-0.5" aria-hidden>
        {STAGES.map((s, i) => (
          <span key={s.value} className="h-1.5 flex-1 rounded-sm" style={{ background: i <= at ? pin : 'rgb(var(--line))' }} />
        ))}
      </div>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        <span className="font-medium text-ink">{t(stageLabel(project.construction_stage))}</span>,{' '}
        {t('stage {n} of {total}', { n: at + 1, total: STAGES.length })}
      </p>
    </div>
  );
}

function Swatch({ frame }: { frame: Frame }) {
  const f = FRAMES.find((x) => x.value === frame)!;
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-ink/25" style={{ background: f.swatch }} />;
}

function Delta({ change, pct }: { change: number; pct: number | null }) {
  const cls = change > 0 ? 'text-[#2E9D57]' : change < 0 ? 'text-signal' : 'text-ink-faint';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  return (
    <span className={`tabular-nums ${cls}`}>
      {sign}
      {formatUsd(Math.abs(Math.round(change)))}
      {pct != null && ` (${sign === '±' ? '' : sign}${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}

/** Current price per frame, with how much it has grown since the first recorded price. */
export function CurrentPrices({ project }: { project: Project }) {
  const { t } = useI18n();
  const cur = currentPrices(project);
  const rows = FRAMES.filter((f) => cur[f.value]);
  if (!rows.length) return <p className="py-1.5 text-[13px] text-ink-faint">{t('No price entered yet.')}</p>;
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((f) => {
        const e = cur[f.value]!;
        const tr = frameTrend(project, f.value);
        return (
          <li key={f.value} className="py-1.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Swatch frame={f.value} /> {t(f.label)}
              </span>
              <span className="font-semibold tabular-nums text-ink">{formatPriceRange(e.min, e.max)}</span>
            </div>
            <div className="flex justify-between gap-3 text-[11.5px] text-ink-faint">
              <span>{t('since {date}', { date: formatDate(e.date) })}</span>
              {tr && (
                <span>
                  <Delta change={tr.change} pct={tr.pct} /> {t('since {date}', { date: formatDate(tr.first.date) })}
                  {tr.perYear != null && <>, ≈{tr.perYear >= 0 ? '+' : '−'}{Math.abs(tr.perYear).toFixed(1)}% {t('a year')}</>}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Price over time, one line per frame. Ranges draw a vertical bar from "from" to "to"
 * with the line passing through their midpoint.
 */
export function PriceChart({ project }: { project: Project }) {
  const { t } = useI18n();
  const series = FRAMES.map((f) => ({ f, pts: frameSeries(project, f.value) })).filter((s) => s.pts.length);
  const all = series.flatMap((s) => s.pts);
  if (all.length < 2) return null;

  const W = 360;
  const H = 170;
  const pad = { l: 46, r: 10, t: 10, b: 24 };
  const times = all.map((e) => Date.parse(e.date));
  let t0 = Math.min(...times);
  let t1 = Math.max(...times);
  if (t1 === t0) {
    t0 -= 15 * 86_400_000;
    t1 += 15 * 86_400_000;
  }
  const lo = Math.min(...all.map((e) => e.min));
  const hi = Math.max(...all.map((e) => e.max ?? e.min));
  const span = hi - lo || hi * 0.1 || 1;
  const y0 = lo - span * 0.12;
  const y1 = hi + span * 0.12;
  const x = (d: string) => pad.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);

  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  const fmtTick = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  const firstDate = new Date(t0).toISOString().slice(0, 10);
  const lastDate = new Date(t1).toISOString().slice(0, 10);

  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('Price per m² over time')}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--ink-faint))">
              {fmtTick(v)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} fontSize="10" fill="rgb(var(--ink-faint))">
          {formatDate(firstDate)}
        </text>
        <text x={W - pad.r} y={H - 6} fontSize="10" textAnchor="end" fill="rgb(var(--ink-faint))">
          {formatDate(lastDate)}
        </text>
        {series.map(({ f, pts }) => (
          <g key={f.value}>
            {pts.map((e) =>
              e.max != null ? (
                <line key={`r${e.id}`} x1={x(e.date)} x2={x(e.date)} y1={y(e.min)} y2={y(e.max)} stroke={f.line} strokeWidth="5" strokeOpacity=".3" strokeLinecap="round" />
              ) : null,
            )}
            {pts.length > 1 && (
              <polyline
                points={pts.map((e) => `${x(e.date)},${y(midpoint(e))}`).join(' ')}
                fill="none"
                stroke={f.line}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            )}
            {pts.map((e) => (
              <circle key={e.id} cx={x(e.date)} cy={y(midpoint(e))} r="3.2" fill="rgb(var(--surface))" stroke={f.line} strokeWidth="2">
                <title>
                  {`${t(f.label)}, ${formatDate(e.date)}: ${formatPriceRange(e.min, e.max)}`}
                </title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-ink-soft">
        {series.map(({ f }) => (
          <span key={f.value} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: f.line }} />
            {t(f.label)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Every price entry, newest first, with the change from the previous price of the same frame. */
export function PriceHistory({ project }: { project: Project }) {
  const { t } = useI18n();
  if (!project.price_history.length) return null;
  const cur = currentPrices(project);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <thead className="text-[11.5px] text-ink-faint">
          <tr>
            <th className="py-1 pr-2 font-normal">{t('Date')}</th>
            <th className="py-1 pr-2 font-normal">{t('Frame')}</th>
            <th className="py-1 pr-2 text-right font-normal">{t('Price / m²')}</th>
            <th className="py-1 text-right font-normal">{t('Change')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {project.price_history.map((e: PriceEntry) => {
            const isCurrent = cur[e.frame]?.id === e.id;
            const step = stepChange(project, e);
            return (
              <tr key={e.id} className={isCurrent ? 'text-ink' : 'text-ink-soft'}>
                <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums">{formatDate(e.date)}</td>
                <td className="whitespace-nowrap py-1.5 pr-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch frame={e.frame} />
                    {t(FRAMES.find((f) => f.value === e.frame)!.short)}
                  </span>
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">
                  {formatPriceRange(e.min, e.max, false)}
                  {isCurrent && <span className="ml-1 text-[11px] text-balcony">{t('current')}</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right text-[12px]">{step ? <Delta change={step.change} pct={step.pct} /> : DASH}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface CardProps {
  project: Project;
  isAdmin: boolean;
  onClose(): void;
  onEdit(): void;
  onRecord(): void;
  onDelete(): void;
}

export function ProjectCard({ project: p, isAdmin, onClose, onEdit, onRecord, onDelete }: CardProps) {
  const { t } = useI18n();
  const people = [p.developer, p.architect && t('architect {name}', { name: p.architect })].filter(Boolean).join(', ');
  return (
    <Panel
      onClose={onClose}
      accent="project"
      accentColor={projectColor(p.color).pin}
      footer={
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="primary" onClick={onEdit}>
              {t('Edit')}
            </Button>
          )}
          <Button size="sm" onClick={onRecord}>
            {t('Record')}
          </Button>
          {isAdmin && (
            <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
              {t('Delete')}
            </Button>
          )}
        </div>
      }
    >
      <div className="relative px-3 pt-3">
        <Gallery project={p} />
        <CloseButton onClick={onClose} className="absolute right-4 top-4 bg-surface/90 shadow-sm" />
      </div>
      <div className="px-4 pb-3 pt-3">
        <h2 className="text-[17px] font-semibold leading-tight text-ink">{p.name}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{people}</p>
        <div className="mt-3">
          <StageMeter project={p} />
        </div>
        <div className="mt-2">
          <CurrentPrices project={p} />
          {p.price_history.length > 0 && (
            <button type="button" onClick={onRecord} className="mt-0.5 text-[12px] text-balcony hover:underline">
              {t('Price history and chart ({n})', { n: p.price_history.length })}
            </button>
          )}
        </div>
        <dl className="mt-1 divide-y divide-line/70 border-t border-line/70">
          <Row label={t('Handover')}>{formatDate(p.handover_date)}</Row>
          <Row label={t('Coordinates')}>
            <span className="tabular-nums">{formatCoords(p.latitude, p.longitude)}</span>
          </Row>
          {p.area_m2 != null && (
            <Row label={t('Territory')}>
              <span className="tabular-nums">{formatArea(p.area_m2)}</span>
            </Row>
          )}
          {p.description && (
            <Row label={t('Notes')}>
              <span className="line-clamp-4 whitespace-pre-line">{p.description}</span>
            </Row>
          )}
        </dl>
      </div>
    </Panel>
  );
}

/** Full record: every stored field, price chart and history, timestamps and quick links. */
export function ProjectRecord({
  project: p,
  isAdmin,
  onBack,
  onClose,
  onEditPrices,
}: {
  project: Project;
  isAdmin: boolean;
  onBack(): void;
  onClose(): void;
  onEditPrices(): void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const coords = `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
  return (
    <Panel
      title={p.name}
      onClose={onClose}
      accent="project"
      accentColor={projectColor(p.color).pin}
      wide
      footer={
        <div className="flex gap-2">
          <Button size="sm" onClick={onBack}>
            {t('Back to card')}
          </Button>
        </div>
      }
    >
      <div className="px-4 pb-4">
        <Gallery project={p} />
        <div className="mt-3">
          <StageMeter project={p} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">{t('Prices')}</h3>
          {isAdmin && (
            <Button size="sm" onClick={onEditPrices}>
              {t('Edit prices')}
            </Button>
          )}
        </div>
        <CurrentPrices project={p} />
        <PriceChart project={p} />
        {p.price_history.length > 0 && (
          <>
            <h3 className="mt-4 text-[13px] font-semibold text-ink">{t('Price history')}</h3>
            <PriceHistory project={p} />
          </>
        )}

        <dl className="mt-4 divide-y divide-line/70 border-t border-line/70">
          <Row label={t('Developer')}>{p.developer}</Row>
          <Row label={t('Architect')}>{p.architect || DASH}</Row>
          <Row label={t('Stage')}>{t(stageLabel(p.construction_stage))}</Row>
          <Row label={t('Handover')}>{formatDate(p.handover_date)}</Row>
          <Row label={t('Latitude')}>
            <span className="tabular-nums">{p.latitude.toFixed(6)}</span>
          </Row>
          <Row label={t('Longitude')}>
            <span className="tabular-nums">{p.longitude.toFixed(6)}</span>
          </Row>
          <Row label={t('Territory')}>{p.area_m2 != null ? <span className="tabular-nums">{formatArea(p.area_m2)}</span> : DASH}</Row>
          <Row label={t('Notes')}>
            <span className="whitespace-pre-line">{p.description || DASH}</span>
          </Row>
          <Row label={t('Added')}>{formatDateTime(p.created_at)}</Row>
          <Row label={t('Last updated')}>{formatDateTime(p.updated_at)}</Row>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              navigator.clipboard?.writeText(coords).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? t('Copied') : t('Copy coordinates')}
          </Button>
          <a
            className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-balcony ring-1 ring-inset ring-line hover:bg-balcony-tint"
            href={`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('Open in Google Maps')}
          </a>
        </div>
      </div>
    </Panel>
  );
}
