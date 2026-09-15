import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

/**
 * A discipline's Untitled group: the lessons filed in no module. Deliberately
 * not a module — no rename, no delete, no drag handle, always last — so the
 * difference between "a box the SME made" and "the shelf itself" is visible.
 * Its one control is "Add lesson", the same action a module header offers,
 * so a discipline with no modules yet can still grow.
 */
export const LibraryUntitled = ({
  lessonCount,
  showHeading = true,
  onAddLesson,
  children,
}: {
  lessonCount: number;
  /** False on the org-level Untitled column, whose header already says it. */
  showHeading?: boolean;
  /** Absent on the org-level column: a lesson filed under no discipline is a triage entry, not something to create on purpose. */
  onAddLesson?: () => void;
  children?: ReactNode;
}) => (
  <section className="flex flex-col">
    {showHeading && (
      <div className="flex items-center gap-2 py-1 ps-3 pe-2">
        <span className="min-w-0 flex-1 font-medium text-secondary text-sm">
          Untitled
        </span>
        <span className="shrink-0 text-tertiary text-xs tabular-nums">
          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
        </span>
        {onAddLesson && (
          <TooltipIconButton
            label="Add lesson to Untitled"
            onClick={onAddLesson}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        )}
      </div>
    )}
    <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
      {lessonCount === 0 ? (
        <p className="px-1 py-3 text-center text-tertiary text-xs">
          Every lesson is in a module
        </p>
      ) : (
        children
      )}
    </div>
  </section>
);
