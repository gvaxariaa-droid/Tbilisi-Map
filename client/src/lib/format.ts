// All money in the platform is US dollars. Values are displayed exactly as stored;
// nothing is ever converted from another currency.

const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dec2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const DASH = '—';

/** $1,400 or $1,400.50 (cents shown only when present). */
export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const cents = Math.round(v * 100) % 100 !== 0;
  return (cents ? usdCents : usdWhole).format(v);
}

/** $1,400 / m² */
export function formatUsdPerM2(v: number | null | undefined): string {
  return v == null ? DASH : `${formatUsd(v)} / m²`;
}

/** $1,200 / m²  or  $1,000–1,500 / m² */
export function formatPriceRange(min: number, max: number | null, perM2 = true): string {
  const unit = perM2 ? ' / m²' : '';
  if (max == null || max === min) return `${formatUsd(min)}${unit}`;
  return `${formatUsd(min)}–${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(max)}${unit}`;
}

/** Compact money for map labels: $550K, $1.25M */
export function formatUsdShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  if (v >= 10_000) return `$${Math.round(v / 1000).toLocaleString('en-US')}K`;
  return formatUsd(v);
}

/** 12,400 m²; adds hectares from 1 ha upward: 12,400 m² (1.24 ha) */
export function formatArea(v: number | null | undefined, withHectares = true): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const m2 = `${v < 100 ? dec2.format(v) : int.format(Math.round(v))} m²`;
  return withHectares && v >= 10_000 ? `${m2} (${dec2.format(v / 10_000)} ha)` : m2;
}

export function formatNumber(v: number | null | undefined): string {
  return v == null ? DASH : dec2.format(v);
}

/** 41.715130° N, 44.827100° E (6 decimals ≈ 0.1 m) */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${ns}, ${Math.abs(lng).toFixed(6)}° ${ew}`;
}

/** 'YYYY-MM-DD' -> '15 Mar 2027' without timezone drift. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return DASH;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/**
 * Parse a user-typed money/number field. Accepts "1,400", "$1400.50", " 2 500 ".
 * Returns null for empty input and NaN for anything unparseable.
 */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s,$]/g, '');
  if (s === '') return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN;
  return Number(s);
}

/** Show a number in an input without grouping, trimmed to 2 decimals. */
export function amountToInput(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return String(Math.round(v * 100) / 100);
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
