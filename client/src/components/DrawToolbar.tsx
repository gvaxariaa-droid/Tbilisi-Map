import type { DrawState } from './MapView.tsx';
import { formatArea } from '../lib/format.ts';
import { ringArea } from '../lib/geo.ts';
import { Button } from './ui.tsx';

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
  const n = draw.vertices.length;
  const drawing = draw.mode === 'draw';
  const what = draw.target === 'project' ? 'territory' : 'plot';
  const hint = drawing
    ? n === 0
      ? `Click the map to place the first corner of the ${what}.`
      : n < 3
        ? `Corner ${n} placed. Keep clicking to add corners.`
        : `Click the first corner, or Finish, to close the ${what}.`
    : draw.selected != null
      ? `Corner ${draw.selected + 1} selected. Drag it, or remove it.`
      : 'Drag corners to move them. Drag the small edge dots to add corners.';

  return (
    <div className="panel-enter pointer-events-auto absolute left-1/2 top-3 z-20 w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg bg-white px-3 py-2.5 shadow-float">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">
            {draw.target === 'project'
              ? drawing ? 'Drawing project territory' : 'Editing project territory'
              : drawing ? 'Drawing land plot' : 'Editing boundary'}
            {n >= 3 && <span className="ml-2 font-normal tabular-nums text-ink-soft">{formatArea(ringArea(draw.vertices))}</span>}
          </p>
          <p className="text-xs text-ink-soft">{hint}</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={onUndo} disabled={draw.history.length === 0} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          {!drawing && (
            <Button size="sm" onClick={onRemoveVertex} disabled={draw.selected == null || n <= 3} title="Remove selected corner (Delete)">
              Remove corner
            </Button>
          )}
          {drawing && (
            <Button size="sm" variant="land" onClick={onFinish} disabled={n < 3} title="Finish polygon (Enter)">
              Finish polygon
            </Button>
          )}
          {!drawing && onDone && (
            <Button size="sm" variant="primary" onClick={onDone} disabled={n < 3}>
              Done
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel} title="Cancel (Esc)">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
