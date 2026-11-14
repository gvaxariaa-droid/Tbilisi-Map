import { useEffect, useMemo, useRef, useState } from 'react';
import { checkPhoto, photoUrl } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';

function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export interface SinglePhotoValue {
  file: File | null; // new file to upload
  remove: boolean; // remove the existing photo
}

/** One photograph per project: choose, replace or remove. */
export function SinglePhotoField({
  existingId,
  value,
  onChange,
}: {
  existingId: string | null;
  value: SinglePhotoValue;
  onChange(v: SinglePhotoValue): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const preview = useObjectUrl(value.file);
  const shown = preview ?? (existingId && !value.remove ? photoUrl(existingId) : null);

  return (
    <div>
      <span className="mb-1 block text-[12.5px] font-medium text-ink-soft">{t('Project photograph')}</span>
      <div className="overflow-hidden rounded-md border border-line bg-paper">
        <div className="aspect-video w-full">
          {shown ? (
             <img src={shown} alt={t('Project photograph')} className="h-full w-full object-cover" />
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="grid h-full w-full place-items-center text-sm text-ink-faint hover:text-ink"
            >
              {t('Add a photo (JPEG, PNG or WebP, up to 10 MB)')}
            </button>
          )}
        </div>
        {shown && (
          <div className="flex gap-1 border-t border-line bg-surface px-2 py-1.5">
            <button type="button" className="rounded px-2 py-1 text-[13px] text-balcony hover:bg-balcony-tint" onClick={() => input.current?.click()}>
              {t('Replace photo')}
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-[13px] text-ink-soft hover:bg-paper"
              onClick={() => onChange({ file: null, remove: !!existingId })}
            >
              {t('Remove photo')}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-signal">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const problem = checkPhoto(f);
          setError(problem);
          if (!problem) onChange({ file: f, remove: false });
        }}
      />
    </div>
  );
}

export interface MultiPhotoValue {
  added: File[];
  removedIds: string[];
}

function Thumb({ src, onRemove, label }: { src: string; onRemove(): void; label: string }) {
  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-md bg-paper">
      <img src={src} alt={label} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-[#1B2830]/70 text-white hover:bg-signal"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function NewThumb({ file, onRemove }: { file: File; onRemove(): void }) {
  const url = useObjectUrl(file);
  return url ? <Thumb src={url} onRemove={onRemove} label={file.name} /> : null;
}

/** Several optional photographs per land plot; changes apply when the form is saved. */
export function MultiPhotoField({
  label,
  existingIds,
  value,
  onChange,
}: {
  label?: string;
  existingIds: string[];
  value: MultiPhotoValue;
  onChange(v: MultiPhotoValue): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const kept = existingIds.filter((id) => !value.removedIds.includes(id));

  return (
    <div>
      <span className="mb-1 block text-[12.5px] font-medium text-ink-soft">{label ?? t('Land photographs')}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {kept.map((id, i) => (
          <Thumb key={id} src={photoUrl(id)} label={t('Photo {n}', { n: i + 1 })} onRemove={() => onChange({ ...value, removedIds: [...value.removedIds, id] })} />
        ))}
        {value.added.map((f, i) => (
          <NewThumb key={`${f.name}-${f.lastModified}-${i}`} file={f} onRemove={() => onChange({ ...value, added: value.added.filter((_, j) => j !== i) })} />
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="grid aspect-[4/3] place-items-center rounded-md border border-dashed border-line text-[13px] text-ink-soft hover:border-ochre hover:text-ink"
        >
          {t('Add photos')}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-signal">{error}</p>}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          const problems = files.map(checkPhoto).filter(Boolean);
          setError(problems.length ? problems.join(' ') : null);
          const ok = files.filter((f) => !checkPhoto(f));
          if (ok.length) onChange({ ...value, added: [...value.added, ...ok].slice(0, 12) });
        }}
      />
    </div>
  );
}
