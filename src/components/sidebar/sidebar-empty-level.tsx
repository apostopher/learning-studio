export type SidebarEmptyLevelReason = 'no-level' | 'no-lessons-at-level';

type SidebarEmptyLevelProps = {
  reason: SidebarEmptyLevelReason;
};

const MESSAGES: Record<SidebarEmptyLevelReason, string> = {
  'no-level': 'Your training team hasn’t set your level for this course yet.',
  'no-lessons-at-level':
    'There are no lessons at your level in this course yet.',
};

/**
 * Why a learner's module list is empty under strict levels. An empty tree
 * with no explanation reads as a broken page; a locked/empty state states its
 * reason. Plain text, not a live region: the main pane's empty state
 * (`LessonEmpty`, `role="status"`) already announces the same reason, and
 * saying it twice is noise.
 */
export const SidebarEmptyLevel = ({ reason }: SidebarEmptyLevelProps) => (
  <p className="px-sidebar-row-inline py-sidebar-row-block text-sm text-secondary">
    {MESSAGES[reason]}
  </p>
);
