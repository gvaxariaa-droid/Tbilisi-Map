import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Frame, LngLat, PriceInput, Project, ProjectColor, ProjectInput, Stage } from '../lib/types.ts';
import { FRAMES, PROJECT_COLORS, STAGES } from '../lib/types.ts';
import { amountToInput, formatArea, formatUsd, parseAmount } from '../lib/format.ts';
import { ringArea, toPolygon } from '../lib/geo.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Button, Field, Panel, TextInput, UnitInput, inputClass } from './ui.tsx';
import { MultiPhotoField, type MultiPhotoValue } from './PhotoFields.tsx';

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
  onSave(input: ProjectInput, photos: MultiPhotoValue): Promise<void>;
  onCancel(): void;
}

/** One editable row of the price history. `key` is local; `id` is set for saved entries. */
interface PriceRow {
  key: string;
  id?: string;
  frame: Frame;
  date: string;
  min: string;
  max: string;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let rowSeq = 0;
const newKey = () => `new-${++rowSeq}`;

const rowMid = (r: PriceRow) => {
  const a = parseAmount(r.min);
  const b = parseAmount(r.max);
  if (a == null || Number.isNaN(a)) return null;
  return b == null || Number.isNaN(b) ? a : (a + b) / 2;
};

export default function ProjectForm(props: Props) {
  const { project, selection, onCoordsChange, area, drawingArea, onDrawArea, onClearArea, onSave, onCancel } = props;
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? '');
  const [developer, setDeveloper] = useState(project?.developer ?? '');
  const [architect, setArchitect] = useState(project?.architect ?? '');
  const [stage, setStage] = useState<Stage>(project?.construction_stage ?? 'design');
  const [color, setColor] = useState<ProjectColor>(project?.color ?? 'blue');
  const [handover, setHandover] = useState(project?.handover_date ?? '');
  const [lat, setLat] = useState(project ? String(project.latitude) : selection ? selection[1].toFixed(6) : '');
  const [lng, setLng] = useState(project ? String(project.longitude) : selection ? selection[0].toFixed(6) : '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [photos, setPhotos] = useState<MultiPhotoValue>({ added: [], removedIds: [] });
  const [rows, setRows] = useState<PriceRow[]>(() =>
    (project?.price_history ?? []).map((e) => ({
      key: e.id,
      id: e.id,
      frame: e.frame,
      date: e.date,
      min: amountToInput(e.min),
      max: amountToInput(e.max),
    })),
  );
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

  const updateRow = (key: string, patch: Partial<PriceRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (frame: Frame) => setRows((rs) => [{ key: newKey(), frame, date: today(), min: '', max: '' }, ...rs]);
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  // Rows shown newest first; the change column compares each row with the previous price of the same frame.
  const ordered = useMemo(() => [...rows].sort((a, b) => b.date.localeCompare(a.date)), [rows]);
  const stepOf = (r: PriceRow) => {
    const older = rows.filter((x) => x.frame === r.frame && x.key !== r.key && x.date < r.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    const a = older ? rowMid(older) : null;
    const b = rowMid(r);
    if (a == null || b == null) return null;
    return { change: b - a, pct: a > 0 ? ((b - a) / a) * 100 : null };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('Enter the project name.');
    if (!developer.trim()) errs.developer = t('Enter the developer or development company.');
    const y = Number(lat);
    const x = Number(lng);
    if (!lat.trim() || !Number.isFinite(y) || Math.abs(y) > 90) errs.lat = t('Click the map or enter a latitude between -90 and 90.');
    if (!lng.trim() || !Number.isFinite(x) || Math.abs(x) > 180) errs.lng = t('Enter a longitude between -180 and 180.');
    if (drawingArea) errs.area = t('Finish drawing the territory first (Finish polygon, then Done).');

    const history: PriceInput[] = [];
    for (const r of rows) {
      const min = parseAmount(r.min);
      const max = parseAmount(r.max);
      if (!r.min.trim() && !r.max.trim()) continue; // empty new row: ignore
      if (Number.isNaN(min) || Number.isNaN(max)) errs[`row_${r.key}`] = t('Enter numbers in US dollars, e.g. 1200.');
      else if (min == null) errs[`row_${r.key}`] = t('Enter the lower price in "From".');
      else if (max != null && max < min) errs[`row_${r.key}`] = t('"To" must be at least "From".');
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errs[`row_${r.key}`] = t('Choose a date.');
      else history.push({ id: r.id, frame: r.frame, min, max: max != null && max !== min ? max : null, date: r.date });
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
          color,
          price_history: history,
        },
        photos,
      );
    } catch (err) {
      setServerError((err as Error).message);
      setBusy(false);
    }
  };

  const hasArea = !!area && area.length >= 3;

  return (
    <Panel
      title={project ? t('Edit project') : t('Add project')}
      onClose={onCancel}
      accent="project"
      wide
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" type="submit" form="project-form" disabled={busy}>
            {busy ? t('Saving…') : project ? t('Save changes') : t('Save project')}
          </Button>
        </div>
      }
    >
      <form id="project-form" onSubmit={submit} className="space-y-3 px-4 pb-4" noValidate>
        <Field label={t('Project name')} error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <Field label={t('Developer / development company')} error={errors.developer}>
          <TextInput value={developer} onChange={(e) => setDeveloper(e.target.value)} maxLength={200} />
        </Field>
        <Field label={t('Architect (optional)')}>
          <TextInput value={architect} onChange={(e) => setArchitect(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Construction stage')}>
            <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGES.map((s, i) => (
                <option key={s.value} value={s.value}>
                  {i + 1}. {t(s.label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Handover date')}>
            <TextInput type="date" value={handover} onChange={(e) => setHandover(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-[12.5px] font-medium text-ink-soft">{t('Colour of the pin and territory')}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('Colour of the pin and territory')}>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                onClick={() => setColor(c.value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] ring-inset ${
                  color === c.value ? 'bg-surface font-medium text-ink ring-2 ring-ink' : 'text-ink-soft ring-1 ring-line hover:text-ink'
                }`}
              >
                <span className="h-3.5 w-3.5 rounded-full ring-2 ring-white" style={{ background: c.pin }} />
                {t(c.label)}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">{t('Price per m² (USD) and its history')}</legend>
          <p className="mb-2 text-xs text-ink-faint">
            {t('The newest entry of each frame is the current price. Add a row for every price change, including past prices with their date. Enter one price in "From", or a range with "To".')}
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FRAMES.map((f) => (
              <Button key={f.value} size="sm" onClick={() => addRow(f.value)}>
                <span className="h-3 w-3 rounded-sm ring-1 ring-ink/25" style={{ background: f.swatch }} />+ {t(f.label)}
              </Button>
            ))}
          </div>
          {ordered.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-3 text-[13px] text-ink-faint">
              {t('No prices yet. Use the buttons above to add the first price.')}
            </p>
          ) : (
            <div className="space-y-2">
              {ordered.map((r) => {
                const step = stepOf(r);
                return (
                  <div key={r.key} className="rounded-md bg-paper px-2 py-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        className={`${inputClass} px-1.5 text-[12.5px]`}
                        aria-label={t('Frame')}
                        value={r.frame}
                        onChange={(e) => updateRow(r.key, { frame: e.target.value as Frame })}
                      >
                        {FRAMES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {t(f.label)}
                          </option>
                        ))}
                      </select>
                      <TextInput type="date" aria-label={t('Date')} className="px-1.5 text-[12.5px]" value={r.date} onChange={(e) => updateRow(r.key, { date: e.target.value })} />
                    </div>
                    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
                      <UnitInput prefix="$" placeholder={t('From')} aria-label={t('From')} value={r.min} onChange={(e) => updateRow(r.key, { min: e.target.value })} />
                      <UnitInput prefix="$" placeholder={t('To')} aria-label={t('To')} value={r.max} onChange={(e) => updateRow(r.key, { max: e.target.value })} />
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        aria-label={t('Delete this price')}
                        title={t('Delete this price')}
                        className="grid h-8 w-8 place-items-center rounded-md text-ink-faint hover:bg-signal/10 hover:text-signal"
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="flex items-center gap-1.5 text-ink-faint">
                        <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-ink/25" style={{ background: FRAMES.find((f) => f.value === r.frame)!.swatch }} />
                        {r.id ? t('Saved entry') : t('New entry')}
                      </span>
                      {step && (
                        <span className={`tabular-nums ${step.change > 0 ? 'text-[#2E9D57]' : step.change < 0 ? 'text-signal' : 'text-ink-faint'}`}>
                          {step.change > 0 ? '+' : step.change < 0 ? '−' : '±'}
                          {formatUsd(Math.abs(Math.round(step.change)))}
                          {step.pct != null && ` (${step.change >= 0 ? '+' : '−'}${Math.abs(step.pct).toFixed(1)}%)`} {t('vs previous')}
                        </span>
                      )}
                    </div>
                    {errors[`row_${r.key}`] && <p className="mt-1 text-xs text-signal">{errors[`row_${r.key}`]}</p>}
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-faint">{t('Changes and deletions are saved when you press Save changes.')}</p>
        </fieldset>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">{t('Location')}</legend>
          <p className="mb-2 text-xs text-ink-faint">{t('Click the map or drag the red point to place the project. You can correct the numbers by hand.')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Latitude')} error={errors.lat}>
              <TextInput inputMode="decimal" value={lat} onChange={(e) => typeCoord(e.target.value, lng)} placeholder="41.715100" className="tabular-nums" />
            </Field>
            <Field label={t('Longitude')} error={errors.lng}>
              <TextInput inputMode="decimal" value={lng} onChange={(e) => typeCoord(lat, e.target.value)} placeholder="44.793000" className="tabular-nums" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-ink-soft">{t('Project territory (optional)')}</legend>
          {drawingArea ? (
            <p className="text-xs text-ink-soft">{t('Drawing on the map. Use the toolbar at the top to finish, then press Done.')}</p>
          ) : hasArea ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] tabular-nums text-ink">{formatArea(ringArea(area!))}</span>
              <span className="flex gap-1.5">
                <Button size="sm" onClick={onDrawArea}>{t('Edit territory')}</Button>
                <Button size="sm" variant="ghost" onClick={onClearArea}>{t('Remove')}</Button>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ink-faint">{t('Outline the site by clicking its corners on the map.')}</p>
              <Button size="sm" onClick={onDrawArea}>{t('Draw territory')}</Button>
            </div>
          )}
          {errors.area && <p className="mt-1 text-xs text-signal">{errors.area}</p>}
        </fieldset>

        <MultiPhotoField
          label={t('Project photographs')}
          existingIds={project?.photo_ids ?? (project?.photo_id ? [project.photo_id] : [])}
          value={photos}
          onChange={setPhotos}
        />

        <Field label={t('Description / notes')}>
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
