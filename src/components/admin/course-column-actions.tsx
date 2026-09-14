import { Button } from '@base-ui/react/button';
import { Loader2, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { cn } from '#/lib/cn';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

/**
 * The course-level actions on a column of the editor's rail: remix the
 * flagship (when offered), add a module, edit the course, delete it.
 *
 * Icon-only with tooltips, and every tooltip names the COURSE. The rail holds
 * several of these side by side, so a bare "Delete" tells a screen-reader
 * user — and anyone reading a tooltip after tabbing — nothing about which
 * course is about to go.
 *
 * The mirror of `DisciplineColumnActions` on the library side, down to the
 * gating rule: edit and delete are withheld entirely from an actor who holds
 * neither permission rather than shown disabled, because they cannot grant
 * themselves one from this screen and a permanently dead control is worse
 * than no control. Adding a MODULE is not gated here — it is course-scoped
 * `structure` authority, which the router context cannot answer for any
 * particular course, so the control is offered and the server refuses if it
 * must.
 */
export const CourseColumnActions = ({
  courseName,
  canEditCourse,
  canDeleteCourse,
  remix,
  onAddModule,
  onEditCourse,
  onDeleteCourse,
}: {
  courseName: string;
  canEditCourse: boolean;
  canDeleteCourse: boolean;
  /**
   * The remix control, when this column may borrow from the flagship
   * (`#/lib/flagship-course`). Absent on the flagship's own column and when
   * no flagship exists. Labelled, not icon-only: it is the one action here
   * whose meaning an icon cannot carry, and it names the course it acts on
   * because the rail holds several columns side by side.
   */
  remix?: {
    sourceName: string;
    isRemixed: boolean;
    isPending: boolean;
    onRemix: () => void;
    onUnremix: () => void;
  };
  onAddModule: () => void;
  onEditCourse: () => void;
  onDeleteCourse: () => void;
}) => (
  <div className="flex items-center gap-0.5">
    {remix && (
      <Button
        type="button"
        disabled={remix.isPending}
        onClick={remix.isRemixed ? remix.onUnremix : remix.onRemix}
        aria-label={
          remix.isPending
            ? `${remix.isRemixed ? 'Un-remixing' : 'Remixing'} ${remix.sourceName}…`
            : remix.isRemixed
              ? `Un-remix ${remix.sourceName} from ${courseName}`
              : `Remix ${remix.sourceName} into ${courseName}`
        }
        className={cn(
          'me-1 inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-60',
          remix.isRemixed
            ? 'bg-apple-3 text-apple-text hover:bg-apple-4'
            : 'bg-gray-3 text-secondary hover:bg-gray-4 hover:text-primary',
        )}
      >
        {remix.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {remix.isRemixed ? 'Un-remix' : 'Remix'} {remix.sourceName}
      </Button>
    )}
    <TooltipIconButton
      label={`Add a module to ${courseName}`}
      onClick={onAddModule}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
    </TooltipIconButton>
    {canEditCourse && (
      <TooltipIconButton label={`Edit ${courseName}`} onClick={onEditCourse}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </TooltipIconButton>
    )}
    {canDeleteCourse && (
      <TooltipIconButton
        label={`Delete ${courseName}`}
        variant="danger"
        onClick={onDeleteCourse}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </TooltipIconButton>
    )}
  </div>
);
