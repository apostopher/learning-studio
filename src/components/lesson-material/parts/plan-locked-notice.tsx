import { Lock } from 'lucide-react';

type PlanLockedNoticeProps = {
  /** What is locked, as the learner reads it: a tab's label, or "Material". */
  subject: string;
};

/**
 * Why a free seat cannot open part of a paid lesson, and what would change
 * it. Same structure and voice as `MaterialLocked`. Presentational and
 * hookless.
 */
export const PlanLockedNotice = ({ subject }: PlanLockedNoticeProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div
    role="status"
    className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-10 text-center"
  >
    <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      <Lock className="size-5" aria-hidden="true" />
    </span>
    <p className="text-base font-medium text-primary">{subject} locked</p>
    <p className="text-sm text-secondary">
      This is a paid lesson, and {subject.toLowerCase()} is part of the paid
      plan. Contact your supervisor for full access.
    </p>
  </div>
);
