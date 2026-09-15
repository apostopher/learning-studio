import type { ReactNode } from 'react';

/**
 * A discipline's Untitled group: the lessons filed in no module, where
 * every lesson starts. Deliberately not a module — no rename, no delete,
 * no drag handle, always last — so the difference between "a box the SME
 * made" and "the shelf itself" is visible.
 */
export const LibraryUntitled = ({
  lessonCount,
  showHeading = true,
  children,
}: {
  lessonCount: number;
  /** False on the org-level Untitled column, whose header already says it. */
  showHeading?: boolean;
  children?: ReactNode;
}) => (
  <section className="flex flex-col">
    {showHeading && (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 font-medium text-secondary text-sm">
          Untitled
        </span>
        <span className="shrink-0 text-tertiary text-xs tabular-nums">
          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
        </span>
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
