import type { DrawState } from './MapView.tsx';
import { formatArea } from '../lib/format.ts';
import { ringArea } from '../lib/geo.ts';
import { Button } from './ui.tsx';
import { useI18n } from '../lib/i18n.tsx';

interface Props {
  draw: DrawState;
  onUndo(): void;
  onFinish(): void;
  onRemoveVertex(): void;
  onCancel(): void;
  /** Project territory only: keep the shape and return to the form. */
  onDone?(): void;
}

/** Floating controls for land drawing and boundary editing. */
export default function DrawToolbar({ draw, onUndo, onFinish, onRemoveVertex, onCancel, onDone }: Props) {
  const { t } = useI18n();
  const n = draw.vertices.length;
  const drawing = draw.mode === 'draw';
  const project = draw.target === 'project';
  const hint = drawing
    ? n === 0
      ? project
        ? t('Click the map to place the first corner of the territory.')
        : t('Click the map to place the first corner of the plot.')
      : n < 3
        ? t('Corner {n} placed. Keep clicking to add corners.', { n })
        : project
          ? t('Click the first corner, or Finish, to close the territory.')
          : t('Click the first corner, or Finish, to close the plot.')
    : draw.selected != null
      ? t('Corner {n} selected. Drag it, or remove it.', { n: draw.selected + 1 })
      : t('Drag corners to move them. Drag the small edge dots to add corners.');

  return (
    <div className="panel-enter pointer-events-auto absolute left-1/2 top-3 z-20 w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg bg-surface px-3 py-2.5 shadow-float">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">
            {project
              ? drawing ? t('Drawing project territory') : t('Editing project territory')
              : drawing ? t('Drawing land plot') : t('Editing boundary')}
            {n >= 3 && <span className="ml-2 font-normal tabular-nums text-ink-soft">{formatArea(ringArea(draw.vertices))}</span>}
          </p>
          <p className="text-xs text-ink-soft">{hint}</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={onUndo} disabled={draw.history.length === 0} title={t('Undo (Ctrl+Z)')}>
            {t('Undo')}
          </Button>
          {!drawing && (
            <Button size="sm" onClick={onRemoveVertex} disabled={draw.selected == null || n <= 3} title={t('Remove selected corner (Delete)')}>
              {t('Remove corner')}
            </Button>
          )}
          {drawing && (
            <Button size="sm" variant="land" onClick={onFinish} disabled={n < 3} title={t('Finish polygon (Enter)')}>
              {t('Finish polygon')}
            </Button>
          )}
          {!drawing && onDone && (
            <Button size="sm" variant="primary" onClick={onDone} disabled={n < 3}>
              {t('Done')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel} title={t('Cancel (Esc)')}>
            {t('Cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
