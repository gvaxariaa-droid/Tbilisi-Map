import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LandColor, LandInput, LandPlot, LngLat } from '../lib/types.ts';
import { LAND_COLORS } from '../lib/types.ts';
import { amountToInput, formatArea, formatUsd, parseAmount } from '../lib/format.ts';
import { derivePrices, ringArea, round2, selfIntersects, toPolygon, type PriceAnchor } from '../lib/geo.ts';
import { Button, Field, Panel, TextInput, UnitInput, inputClass } from './ui.tsx';
import { MultiPhotoField, type MultiPhotoValue } from './PhotoFields.tsx';

interface Props {
  land?: LandPlot;
  /** Live polygon from the map editor. */
  vertices: LngLat[];
  onSave(input: LandInput, photos: MultiPhotoValue): Promise<void>;
  onCancel(): void;
}

export default function LandForm({ land, vertices, onSave, onCancel }: Props) {
  const [name, setName] = useState(land?.name ?? '');
  const [manualArea, setManualArea] = useState(land?.area_is_manual ?? false);
  const [areaText, setAreaText] = useState(land?.area_is_manual ? amountToInput(land.area_m2) : '');
  const [total, setTotal] = useState(amountToInput(land?.total_price_usd));
  const [perM2, setPerM2] = useState(amountToInput(land?.price_per_m2_usd));
  const [anchor, setAnchor] = useState<PriceAnchor>(land?.price_per_m2_usd != null && land?.total_price_usd == null ? 'perM2' : 'total');
  const [k2, setK2] = useState(amountToInput(land?.k2_coefficient));
  const [ownerName, setOwnerName] = useState(land?.owner_name ?? '');
  const [ownerPhone, setOwnerPhone] = useState(land?.owner_phone ?? '');
  const [agentName, setAgentName] = useState(land?.agent_name ?? '');
  const [agentPhone, setAgentPhone] = useState(land?.agent_phone ?? '');
  const [notes, setNotes] = useState(land?.notes ?? '');
  const [color, setColor] = useState<LandColor>(land?.color ?? 'orange');
  const [cadastral, setCadastral] = useState(land?.cadastral_code ?? '');
  const [photos, setPhotos] = useState<MultiPhotoValue>({ added: [], removedIds: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const computedArea = round2(ringArea(vertices));
  const manualValue = parseAmount(areaText);
  const effectiveArea = manualArea ? (manualValue && manualValue > 0 ? manualValue : null) : computedArea;
  const crossing = selfIntersects(vertices);

  // Area changed (shape edited or manual area typed): keep the anchored price, recompute the other one.
  const lastArea = useRef(effectiveArea);
  useEffect(() => {
    if (lastArea.current === effectiveArea) return;
    lastArea.current = effectiveArea;
    recompute(anchor, total, perM2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveArea]);

  function recompute(a: PriceAnchor, totalText: string, perText: string) {
    const t = parseAmount(totalText);
    const p = parseAmount(perText);
    if (Number.isNaN(t) || Number.isNaN(p)) return;
    const out = derivePrices(effectiveArea, t, p, a);
    if (a === 'total') setPerM2(amountToInput(out.perM2));
    else setTotal(amountToInput(out.total));
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Give the land plot a name.';
    if (vertices.length < 3) errs.shape = 'The boundary needs at least 3 points.';
    else if (crossing) errs.shape = 'The boundary edges cross each other. Drag the points so the shape does not overlap itself.';
    if (manualArea && !(manualValue && manualValue > 0)) errs.area = 'Enter the corrected area in m², or use the calculated area.';
    const t = parseAmount(total);
    const p = parseAmount(perM2);
    const k = parseAmount(k2);
    if (Number.isNaN(t)) errs.total = 'Enter a number in US dollars.';
    if (Number.isNaN(p)) errs.perM2 = 'Enter a number in US dollars.';
    if (Number.isNaN(k) || (k != null && k > 100)) errs.k2 = 'Enter a coefficient such as 2.5.';
    if (cadastral && !/^[0-9A-Za-z.\-/ ]*$/.test(cadastral)) errs.cadastral = 'Use digits, dots and dashes, e.g. 01.72.14.009.012';
    for (const [key, v] of [['ownerPhone', ownerPhone], ['agentPhone', agentPhone]] as const) {
      if (v && !/^[+0-9 ()\-.]*$/.test(v)) errs[key] = 'Use digits, spaces, +, - and brackets only.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setServerError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          geometry: toPolygon(vertices),
          area_is_manual: manualArea,
          area_m2: manualArea ? (manualValue as number) : null,
          total_price_usd: t as number | null,
          price_per_m2_usd: p as number | null,
          k2_coefficient: k as number | null,
          owner_name: ownerName.trim() || null,
          owner_phone: ownerPhone.trim() || null,
          agent_name: agentName.trim() || null,
          agent_phone: agentPhone.trim() || null,
          notes: notes.trim() || null,
          color,
          cadastral_code: cadastral.trim() || null,
        },
        photos,
      );
    } catch (err) {
      setServerError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Panel
      title={land ? 'Edit land plot' : 'Save land plot'}
      onClose={onCancel}
      accent="land"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="land" type="submit" form="land-form" disabled={busy}>
            {busy ? 'Saving…' : 'Save land'}
          </Button>
        </div>
      }
    >
      <form id="land-form" onSubmit={submit} className="space-y-3 px-4 pb-4" noValidate>
        <div className="rounded-md bg-ochre-tint px-3 py-2.5">
          <p className="text-[12.5px] text-ink-soft">Area from the drawn boundary</p>
          <p className="text-xl font-semibold tabular-nums text-ink">{formatArea(computedArea)}</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {vertices.length} corner points. Drag points on the map to adjust; the area updates as you go.
          </p>
          {errors.shape && <p className="mt-1 text-xs text-signal">{errors.shape}</p>}
          {!errors.shape && crossing && <p className="mt-1 text-xs text-signal">The boundary edges cross. Fix the shape before saving.</p>}
        </div>

        <Field label="Land plot name" error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus placeholder="e.g. Digomi, Beliashvili St. plot" />
        </Field>

        <Field label="Cadastral code" error={errors.cadastral}>
          <TextInput value={cadastral} onChange={(e) => setCadastral(e.target.value)} maxLength={60} placeholder="e.g. 01.72.14.009.012" className="tabular-nums" />
        </Field>

        <div>
          <span className="mb-1 block text-[12.5px] font-medium text-ink-soft">Colour on the map</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Colour on the map">
            {LAND_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                onClick={() => setColor(c.value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] ring-1 ring-inset ${
                  color === c.value ? 'bg-white font-medium text-ink ring-2 ring-ink' : 'text-ink-soft ring-line hover:text-ink'
                }`}
              >
                <span className="h-3.5 w-3.5 rounded-sm" style={{ background: c.fill, boxShadow: `inset 0 0 0 1.5px ${c.line}` }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={manualArea}
              onChange={(e) => {
                setManualArea(e.target.checked);
                if (e.target.checked && !areaText) setAreaText(amountToInput(computedArea));
              }}
              className="h-4 w-4 accent-ochre"
            />
            Correct the area by hand (e.g. from the cadastral extract)
          </label>
          {manualArea && (
            <Field label="Land area" error={errors.area} className="mt-2" hint={`Calculated: ${formatArea(computedArea)}`}>
              <UnitInput unit="m²" value={areaText} onChange={(e) => setAreaText(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Total asking price" error={errors.total}>
            <UnitInput
              prefix="$"
              unit="USD"
              value={total}
              onChange={(e) => {
                setTotal(e.target.value);
                setAnchor('total');
                recompute('total', e.target.value, perM2);
              }}
            />
          </Field>
          <Field label="Price per m²" error={errors.perM2}>
            <UnitInput
              prefix="$"
              unit="USD/m²"
              value={perM2}
              onChange={(e) => {
                setPerM2(e.target.value);
                setAnchor('perM2');
                recompute('perM2', total, e.target.value);
              }}
            />
          </Field>
        </div>
        <p className="-mt-1 text-xs text-ink-faint">
          {effectiveArea
            ? `Type either price; the other is calculated from ${formatArea(effectiveArea, false)}.`
            : 'Prices are calculated once the area is known.'}
          {parseAmount(total) ? ` Total: ${formatUsd(parseAmount(total))}.` : ''}
        </p>

        <Field label="K2 coefficient" error={errors.k2} className="w-1/2 pr-1.5">
          <UnitInput value={k2} onChange={(e) => setK2(e.target.value)} placeholder="e.g. 2.5" />
        </Field>

        <fieldset className="grid grid-cols-2 gap-3 rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">Contacts (visible to signed-in users only)</legend>
          <Field label="Owner's name">
            <TextInput value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Owner's phone" error={errors.ownerPhone}>
            <TextInput type="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} maxLength={40} placeholder="+995 5__ __ __ __" />
          </Field>
          <Field label="Agent's name">
            <TextInput value={agentName} onChange={(e) => setAgentName(e.target.value)} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Agent's phone" error={errors.agentPhone}>
            <TextInput type="tel" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} maxLength={40} />
          </Field>
        </fieldset>

        <MultiPhotoField existingIds={land?.photo_ids ?? []} value={photos} onChange={setPhotos} />

        <Field label="Additional notes">
          <textarea className={`${inputClass} min-h-[84px]`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
        </Field>

        {serverError && (
          <p role="alert" className="rounded-md bg-signal/10 px-3 py-2 text-sm text-signal">
            {serverError}
          </p>
        )}
      </form>
    </Panel>
  );
}
