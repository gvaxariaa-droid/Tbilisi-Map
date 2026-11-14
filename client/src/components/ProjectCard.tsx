import { useState } from 'react';
import type { Project } from '../lib/types.ts';
import { STAGES, stageIndex, stageLabel } from '../lib/types.ts';
import { photoUrl } from '../lib/api.ts';
import { formatCoords, formatDate, formatDateTime, formatUsdPerM2 } from '../lib/format.ts';
import { Button, CloseButton, Panel, Row } from './ui.tsx';

function PhotoOrPlaceholder({ id, alt }: { id: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!id || failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-[repeating-linear-gradient(135deg,#EEF1F0_0_10px,#E6EAE8_10px_20px)]">
        <span className="rounded bg-white/80 px-2 py-0.5 text-xs text-ink-faint">No photograph yet</span>
      </div>
    );
  }
  return <img src={photoUrl(id)} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />;
}

/** Eight-step meter: construction stages are a real sequence, so the card shows where the build is. */
export function StageMeter({ stage }: { stage: Project['construction_stage'] }) {
  const at = stageIndex(stage);
  return (
    <div>
      <div className="flex gap-0.5" aria-hidden>
        {STAGES.map((s, i) => (
          <span key={s.value} className={`h-1.5 flex-1 rounded-sm ${i <= at ? 'bg-balcony' : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-1 text-[12.5px] text-ink-soft">
        <span className="font-medium text-ink">{stageLabel(stage)}</span>, stage {at + 1} of {STAGES.length}
      </p>
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
  const people = [p.developer, p.architect && `architect ${p.architect}`].filter(Boolean).join(', ');
  return (
    <Panel
      onClose={onClose}
      accent="project"
      footer={
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="primary" onClick={onEdit}>
              Edit
            </Button>
          )}
          <Button size="sm" onClick={onRecord}>
            Record
          </Button>
          {isAdmin && (
            <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      }
    >
      <div className="relative px-3 pt-3">
        <div className="aspect-video w-full overflow-hidden rounded-md">
          <PhotoOrPlaceholder id={p.photo_id} alt={`${p.name}, photograph`} />
        </div>
        <CloseButton onClick={onClose} className="absolute right-4 top-4 bg-white/90 shadow-sm" />
      </div>
      <div className="px-4 pb-3 pt-3">
        <h2 className="text-[17px] font-semibold leading-tight text-ink">{p.name}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{people}</p>
        <div className="mt-3">
          <StageMeter stage={p.construction_stage} />
        </div>
        <dl className="mt-2 divide-y divide-line/70">
          <Row label="Price">
            <span className="font-semibold tabular-nums">{formatUsdPerM2(p.price_per_m2_usd)}</span>
          </Row>
          <Row label="Handover">{formatDate(p.handover_date)}</Row>
          <Row label="Coordinates">
            <span className="tabular-nums">{formatCoords(p.latitude, p.longitude)}</span>
          </Row>
          {p.description && (
            <Row label="Notes">
              <span className="line-clamp-4 whitespace-pre-line">{p.description}</span>
            </Row>
          )}
        </dl>
      </div>
    </Panel>
  );
}

/** Full record: every stored field, larger photo, timestamps and quick links. */
export function ProjectRecord({ project: p, onBack, onClose }: { project: Project; onBack(): void; onClose(): void }) {
  const [copied, setCopied] = useState(false);
  const coords = `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
  return (
    <Panel title={p.name} onClose={onClose} accent="project" wide footer={
      <div className="flex gap-2">
        <Button size="sm" onClick={onBack}>Back to card</Button>
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>Print</Button>
      </div>
    }>
      <div className="px-4 pb-4">
        <div className="aspect-video w-full overflow-hidden rounded-md">
          <PhotoOrPlaceholder id={p.photo_id} alt={`${p.name}, photograph`} />
        </div>
        <div className="mt-3"><StageMeter stage={p.construction_stage} /></div>
        <dl className="mt-2 divide-y divide-line/70">
          <Row label="Developer">{p.developer}</Row>
          <Row label="Architect">{p.architect || '—'}</Row>
          <Row label="Stage">{stageLabel(p.construction_stage)}</Row>
          <Row label="Price"><span className="font-semibold tabular-nums">{formatUsdPerM2(p.price_per_m2_usd)}</span></Row>
          <Row label="Handover">{formatDate(p.handover_date)}</Row>
          <Row label="Latitude"><span className="tabular-nums">{p.latitude.toFixed(6)}</span></Row>
          <Row label="Longitude"><span className="tabular-nums">{p.longitude.toFixed(6)}</span></Row>
          <Row label="Notes"><span className="whitespace-pre-line">{p.description || '—'}</span></Row>
          <Row label="Added">{formatDateTime(p.created_at)}</Row>
          <Row label="Last updated">{formatDateTime(p.updated_at)}</Row>
          <Row label="Record ID"><span className="text-xs text-ink-soft">{p.id}</span></Row>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigator.clipboard?.writeText(coords).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
            {copied ? 'Copied' : 'Copy coordinates'}
          </Button>
          <a
            className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-balcony ring-1 ring-inset ring-line hover:bg-balcony-tint"
            href={`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Maps
          </a>
        </div>
      </div>
    </Panel>
  );
}
