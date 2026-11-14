import { useState } from 'react';
import type { LandPlot } from '../lib/types.ts';
import { photoUrl } from '../lib/api.ts';
import { landColor } from '../lib/types.ts';
import { useI18n } from '../lib/i18n.tsx';
import { centroid, fromPolygon } from '../lib/geo.ts';
import { DASH, formatArea, formatNumber, formatUsd, formatUsdPerM2, telHref } from '../lib/format.ts';
import { Button, Panel, Row } from './ui.tsx';

function Phone({ value }: { value: string | null | undefined }) {
  if (!value) return <>{DASH}</>;
  return (
    <a href={telHref(value)} className="tabular-nums text-balcony underline decoration-balcony/30 underline-offset-2 hover:decoration-balcony">
      {value}
    </a>
  );
}

interface Props {
  land: LandPlot;
  isAdmin: boolean;
  signedIn: boolean;
  onClose(): void;
  onEdit(): void;
  onDelete(): void;
  onZoom(): void;
}

export default function LandCard({ land: l, isAdmin, signedIn, onClose, onEdit, onDelete, onZoom }: Props) {
  const [photo, setPhoto] = useState(0);
  const { t } = useI18n();
  const photos = l.photo_ids;
  const [cLng, cLat] = centroid(fromPolygon(l.geometry));
  return (
    <Panel
      title={l.name}
      onClose={onClose}
      accent="land"
      accentColor={landColor(l.color).fill}
      footer={
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="primary" onClick={onEdit}>
              {t('Edit')}
            </Button>
          )}
          <Button size="sm" onClick={onZoom}>
            {t('Zoom to land')}
          </Button>
          <a
            className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-balcony ring-1 ring-inset ring-line hover:bg-balcony-tint"
            href={`https://www.google.com/maps/search/?api=1&query=${cLat.toFixed(6)},${cLng.toFixed(6)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('Google Maps')}
          </a>
          {isAdmin && (
            <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
              {t('Delete')}
            </Button>
          )}
        </div>
      }
    >
      <div className="px-4 pb-3">
        <div className="flex items-baseline justify-between gap-3 rounded-md bg-ochre-tint px-3 py-2.5">
          <div>
            <p className="text-[12px] text-ink-soft">{l.area_is_manual ? t('Area (corrected by hand)') : t('Area')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">{formatArea(l.area_m2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-ink-soft">{t('Asking price')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">{formatUsd(l.total_price_usd)}</p>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="mt-3">
            <div className="aspect-video overflow-hidden rounded-md bg-paper">
              <img src={photoUrl(photos[photo] ?? photos[0])} alt={l.name} className="h-full w-full object-cover" loading="lazy" />
            </div>
            {photos.length > 1 && (
              <div className="mt-1.5 flex gap-1 overflow-x-auto">
                {photos.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPhoto(i)}
                    aria-label={t('Photo {n}', { n: i + 1 })}
                    className={`h-11 w-16 shrink-0 overflow-hidden rounded ${i === photo ? 'ring-2 ring-ochre' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <img src={photoUrl(id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <dl className="mt-2 divide-y divide-line/70">
          <Row label={t("Cadastral code")}>
            {l.cadastral_code ? <span className="select-all tabular-nums">{l.cadastral_code}</span> : DASH}
          </Row>
          <Row label={t("Price per m²")}><span className="tabular-nums">{formatUsdPerM2(l.price_per_m2_usd)}</span></Row>
          <Row label={t("K2 coefficient")}><span className="tabular-nums">{formatNumber(l.k2_coefficient)}</span></Row>
          {l.area_is_manual && <Row label={t("Drawn area")}><span className="tabular-nums">{formatArea(l.computed_area_m2)}</span></Row>}
          {signedIn ? (
            <>
              <Row label={t("Owner")}>{l.owner_name || DASH}</Row>
              <Row label={t("Owner's phone")}><Phone value={l.owner_phone} /></Row>
              <Row label={t("Agent")}>{l.agent_name || DASH}</Row>
              <Row label={t("Agent's phone")}><Phone value={l.agent_phone} /></Row>
            </>
          ) : (
            <Row label={t("Contacts")}><span className="text-ink-faint">{t('Sign in to see owner and agent contacts.')}</span></Row>
          )}
          {l.notes && <Row label={t("Notes")}><span className="whitespace-pre-line">{l.notes}</span></Row>}
        </dl>
      </div>
    </Panel>
  );
}
