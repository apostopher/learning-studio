import { Pencil, Plus, Trash2 } from 'lucide-react';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

/**
 * The course-level actions on a column of the editor's rail: add a module,
 * edit the course, delete it.
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
  onAddModule,
  onEditCourse,
  onDeleteCourse,
}: {
  courseName: string;
  canEditCourse: boolean;
  canDeleteCourse: boolean;
  onAddModule: () => void;
  onEditCourse: () => void;
  onDeleteCourse: () => void;
}) => (
  <div className="flex items-center gap-0.5">
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
