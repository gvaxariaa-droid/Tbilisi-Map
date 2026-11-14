import { useEffect, useState, type FormEvent } from 'react';
import type { LngLat, Project, ProjectInput, Stage } from '../lib/types.ts';
import { STAGES } from '../lib/types.ts';
import { amountToInput, parseAmount } from '../lib/format.ts';
import { Button, Field, Panel, TextInput, UnitInput, inputClass } from './ui.tsx';
import { SinglePhotoField, type SinglePhotoValue } from './PhotoFields.tsx';

interface Props {
  project?: Project;
  /** Current red-circle position; clicking the map moves it and fills the coordinates. */
  selection: LngLat | null;
  onCoordsChange(p: LngLat | null): void;
  onSave(input: ProjectInput, photo: SinglePhotoValue): Promise<void>;
  onCancel(): void;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export default function ProjectForm({ project, selection, onCoordsChange, onSave, onCancel }: Props) {
  const [name, setName] = useState(project?.name ?? '');
  const [developer, setDeveloper] = useState(project?.developer ?? '');
  const [architect, setArchitect] = useState(project?.architect ?? '');
  const [stage, setStage] = useState<Stage>(project?.construction_stage ?? 'planning');
  const [price, setPrice] = useState(amountToInput(project?.price_per_m2_usd));
  const [handover, setHandover] = useState(project?.handover_date ?? '');
  const [lat, setLat] = useState(project ? String(project.latitude) : selection ? selection[1].toFixed(6) : '');
  const [lng, setLng] = useState(project ? String(project.longitude) : selection ? selection[0].toFixed(6) : '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [photo, setPhoto] = useState<SinglePhotoValue>({ file: null, remove: false });
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter the project name.';
    if (!developer.trim()) errs.developer = 'Enter the developer or development company.';
    const p = parseAmount(price);
    if (Number.isNaN(p)) errs.price = 'Enter a number in US dollars, e.g. 1400.';
    const y = Number(lat);
    const x = Number(lng);
    if (!lat.trim() || !Number.isFinite(y) || Math.abs(y) > 90) errs.lat = 'Click the map or enter a latitude between -90 and 90.';
    if (!lng.trim() || !Number.isFinite(x) || Math.abs(x) > 180) errs.lng = 'Enter a longitude between -180 and 180.';
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
          price_per_m2_usd: p as number | null,
          handover_date: handover || null,
          latitude: y,
          longitude: x,
          description: description.trim() || null,
        },
        photo,
      );
    } catch (err) {
      setServerError((err as Error).message);
      setBusy(false);
    }
  };

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
        <Field label="Price per square metre" error={errors.price}>
          <UnitInput prefix="$" unit="USD/m²" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1400" />
        </Field>

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
