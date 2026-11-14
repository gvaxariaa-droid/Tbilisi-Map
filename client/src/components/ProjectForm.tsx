import { useEffect, useState, type FormEvent } from 'react';
import type { Frame, LngLat, PriceInput, Project, ProjectInput, Stage } from '../lib/types.ts';
import { FRAMES, STAGES } from '../lib/types.ts';
import { amountToInput, formatArea, parseAmount } from '../lib/format.ts';
import { ringArea, toPolygon } from '../lib/geo.ts';
import { currentPrices } from '../lib/prices.ts';
import { Button, Field, Panel, TextInput, UnitInput, inputClass } from './ui.tsx';
import { SinglePhotoField, type SinglePhotoValue } from './PhotoFields.tsx';

interface Props {
  project?: Project;
  /** Current red-circle position; clicking the map moves it and fills the coordinates. */
  selection: LngLat | null;
  onCoordsChange(p: LngLat | null): void;
  /** Territory being drawn or already drawn for this form. */
  area: LngLat[] | null;
  drawingArea: boolean;
  onDrawArea(): void;
  onClearArea(): void;
  onSave(input: ProjectInput, photo: SinglePhotoValue): Promise<void>;
  onCancel(): void;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type PriceText = Record<Frame, { min: string; max: string }>;

export default function ProjectForm(props: Props) {
  const { project, selection, onCoordsChange, area, drawingArea, onDrawArea, onClearArea, onSave, onCancel } = props;
  const [name, setName] = useState(project?.name ?? '');
  const [developer, setDeveloper] = useState(project?.developer ?? '');
  const [architect, setArchitect] = useState(project?.architect ?? '');
  const [stage, setStage] = useState<Stage>(project?.construction_stage ?? 'planning');
  const [handover, setHandover] = useState(project?.handover_date ?? '');
  const [lat, setLat] = useState(project ? String(project.latitude) : selection ? selection[1].toFixed(6) : '');
  const [lng, setLng] = useState(project ? String(project.longitude) : selection ? selection[0].toFixed(6) : '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [photo, setPhoto] = useState<SinglePhotoValue>({ file: null, remove: false });
  const [prices, setPrices] = useState<PriceText>(() => {
    const cur = project ? currentPrices(project) : {};
    const out = {} as PriceText;
    for (const f of FRAMES) {
      const e = cur[f.value];
      out[f.value] = { min: amountToInput(e?.min), max: amountToInput(e?.max) };
    }
    return out;
  });
  const [priceDate, setPriceDate] = useState(today());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Map click -> coordinates (skip when the fields already hold that value, so typing is not disturbed).
  useEffect(() => {
    if (!selection) return;
    const [x, y] = selection;
    if (!near(Number(lat), y) || !near(Number(lng), x)) {
      setLat(y.toFixed(6));
      setLng(x.toFixed(6));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Typed coordinates -> red circle.
  const typeCoord = (nextLat: string, nextLng: string) => {
    setLat(nextLat);
    setLng(nextLng);
    const y = Number(nextLat);
    const x = Number(nextLng);
    if (nextLat.trim() && nextLng.trim() && Number.isFinite(y) && Number.isFinite(x) && Math.abs(y) <= 90 && Math.abs(x) <= 180) {
      onCoordsChange([x, y]);
    }
  };

  const setPrice = (f: Frame, key: 'min' | 'max', v: string) => setPrices((p) => ({ ...p, [f]: { ...p[f], [key]: v } }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter the project name.';
    if (!developer.trim()) errs.developer = 'Enter the developer or development company.';
    const y = Number(lat);
    const x = Number(lng);
    if (!lat.trim() || !Number.isFinite(y) || Math.abs(y) > 90) errs.lat = 'Click the map or enter a latitude between -90 and 90.';
    if (!lng.trim() || !Number.isFinite(x) || Math.abs(x) > 180) errs.lng = 'Enter a longitude between -180 and 180.';
    if (drawingArea) errs.area = 'Finish drawing the territory first (Finish polygon, then Done).';

    const priceList: PriceInput[] = [];
    for (const f of FRAMES) {
      const min = parseAmount(prices[f.value].min);
      const max = parseAmount(prices[f.value].max);
      if (Number.isNaN(min) || Number.isNaN(max)) {
        errs[`price_${f.value}`] = 'Enter numbers in US dollars, e.g. 1200.';
      } else if (min == null && max != null) {
        errs[`price_${f.value}`] = 'Enter the lower price in "From".';
      } else if (min != null && max != null && max < min) {
        errs[`price_${f.value}`] = '"To" must be at least "From".';
      } else if (min != null) {
        priceList.push({ frame: f.value, min, max: max != null && max !== min ? max : null });
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setServerError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          developer: developer.trim(),
          architect: architect.trim() || null,
          construction_stage: stage,
          handover_date: handover || null,
          latitude: y,
          longitude: x,
          description: description.trim() || null,
          area: area && area.length >= 3 ? toPolygon(area) : null,
          prices: priceList,
          price_date: priceDate || null,
        },
        photo,
      );
    } catch (err) {
      setServerError((err as Error).message);
      setBusy(false);
    }
  };

  const hasArea = !!area && area.length >= 3;

  return (
    <Panel
      title={project ? 'Edit project' : 'Add project'}
      onClose={onCancel}
      accent="project"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="project-form" disabled={busy}>
            {busy ? 'Saving…' : project ? 'Save changes' : 'Save project'}
          </Button>
        </div>
      }
    >
      <form id="project-form" onSubmit={submit} className="space-y-3 px-4 pb-4" noValidate>
        <Field label="Project name" error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <Field label="Developer / development company" error={errors.developer}>
          <TextInput value={developer} onChange={(e) => setDeveloper(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Architect (optional)">
          <TextInput value={architect} onChange={(e) => setArchitect(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Construction stage">
            <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Handover date">
            <TextInput type="date" value={handover} onChange={(e) => setHandover(e.target.value)} />
          </Field>
        </div>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">Price per m² (USD)</legend>
          <p className="mb-2 text-xs text-ink-faint">
            Enter one price in "From", or a range with "To". Leave a frame empty if the project does not sell it.
          </p>
          <div className="space-y-2">
            {FRAMES.map((f) => (
              <div key={f.value}>
                <div className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] text-ink">
                    <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-ink/25" style={{ background: f.swatch }} />
                    {f.label}
                  </span>
                  <UnitInput prefix="$" placeholder="From" aria-label={`${f.label} price from`} value={prices[f.value].min} onChange={(e) => setPrice(f.value, 'min', e.target.value)} />
                  <UnitInput prefix="$" placeholder="To" aria-label={`${f.label} price to`} value={prices[f.value].max} onChange={(e) => setPrice(f.value, 'max', e.target.value)} />
                </div>
                {errors[`price_${f.value}`] && <p className="mt-1 text-xs text-signal">{errors[`price_${f.value}`]}</p>}
              </div>
            ))}
          </div>
          <Field
            label="Price date"
            className="mt-3"
            hint={project ? 'Prices you change are added to the price history with this date. Earlier prices are kept.' : 'The date these prices apply from.'}
          >
            <TextInput type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
          </Field>
        </fieldset>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">Location</legend>
          <p className="mb-2 text-xs text-ink-faint">Click the map to place the project. You can correct the numbers by hand.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" error={errors.lat}>
              <TextInput inputMode="decimal" value={lat} onChange={(e) => typeCoord(e.target.value, lng)} placeholder="41.715100" className="tabular-nums" />
            </Field>
            <Field label="Longitude" error={errors.lng}>
              <TextInput inputMode="decimal" value={lng} onChange={(e) => typeCoord(lat, e.target.value)} placeholder="44.793000" className="tabular-nums" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">Project territory (optional)</legend>
          {drawingArea ? (
            <p className="text-xs text-ink-soft">Drawing on the map. Use the toolbar at the top to finish, then press Done.</p>
          ) : hasArea ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] tabular-nums text-ink">{formatArea(ringArea(area!))}</span>
              <span className="flex gap-1.5">
                <Button size="sm" onClick={onDrawArea}>Edit territory</Button>
                <Button size="sm" variant="ghost" onClick={onClearArea}>Remove</Button>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ink-faint">Outline the site by clicking its corners on the map.</p>
              <Button size="sm" onClick={onDrawArea}>Draw territory</Button>
            </div>
          )}
          {errors.area && <p className="mt-1 text-xs text-signal">{errors.area}</p>}
        </fieldset>

        <SinglePhotoField existingId={project?.photo_id ?? null} value={photo} onChange={setPhoto} />

        <Field label="Description / notes">
          <textarea className={`${inputClass} min-h-[84px]`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
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
