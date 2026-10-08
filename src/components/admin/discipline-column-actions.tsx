import { FilePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

/**
 * The actions on a discipline column: add a lesson to it, add a module to it,
 * edit it (its name and its subject experts), delete it. A lesson added here
 * lands at the column's root level, outside every module — the only way to
 * add one to a discipline that has no modules yet. To add straight into a
 * module, use that module's own button.
 *
 * Icon-only with tooltips, and every tooltip names the DISCIPLINE. A library
 * pane holds many of these rows side by side, so a bare "Delete" tells a
 * screen-reader user — and anyone reading a tooltip after tabbing — nothing
 * about which of eight columns is about to go.
 *
 * Edit and delete are withheld entirely from a non-admin rather than shown
 * disabled: both are `requireAdmin` on the server (editing covers appointing
 * subject experts, which an SME must never be able to do for themselves), the
 * actor cannot become an admin from this screen, and a permanently dead
 * control is worse than no control. Add-module and add-lesson are always
 * offered, because whether this actor may write to THIS discipline is a
 * per-discipline question the router context cannot answer — the server
 * decides, and the mutation turns its 403 into a sentence. Add-module is
 * always offered for the same reason.
 *
 * Delete is NOT disabled when the discipline still holds lessons. It opens the
 * confirmation, which states the block and the count in visible text: a
 * disabled tooltip trigger takes `pointer-events-none`, so the very
 * explanation a mouse user needs would be the thing they could not reach.
 */
export const DisciplineColumnActions = ({
  disciplineName,
  canManage,
  onAddLesson,
  onAddModule,
  onRename,
  onDelete,
}: {
  disciplineName: string;
  canManage: boolean;
  onAddLesson: () => void;
  onAddModule: () => void;
  onRename: () => void;
  onDelete: () => void;
}) => (
  <div className="flex items-center gap-0.5">
    <TooltipIconButton
      label={`Add a lesson to ${disciplineName}`}
      onClick={onAddLesson}
    >
      <FilePlus className="h-4 w-4" aria-hidden="true" />
    </TooltipIconButton>
    <TooltipIconButton
      label={`Add a module to ${disciplineName}`}
      onClick={onAddModule}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
    </TooltipIconButton>
    {canManage && (
      <>
        <TooltipIconButton label={`Edit ${disciplineName}`} onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton
          label={`Delete ${disciplineName}`}
          variant="danger"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </TooltipIconButton>
      </>
    )}
  </div>
);
