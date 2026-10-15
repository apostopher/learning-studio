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
 * reason. `role="status"` so it is announced, not just painted.
 */
export const SidebarEmptyLevel = ({ reason }: SidebarEmptyLevelProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <p
    role="status"
    className="px-sidebar-row-inline py-sidebar-row-block text-sm text-secondary"
  >
    {MESSAGES[reason]}
  </p>
);
