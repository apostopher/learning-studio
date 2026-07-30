import { Lock } from 'lucide-react';

type CoverageNoticeProps = {
  /** Watched-milestones the student has actually crossed. */
  hit: number;
  /** Watched-milestones required (every milestone except the final 100). */
  total: number;
};

/**
 * Shown when the video reaches the end but the student skipped part of it.
 * Without this they see a video that finished, nothing unlocked, and no
 * explanation — the one case where their mental model is confidently wrong.
 * Mirrors MaterialLocked/LessonLocked in structure and copy voice so the
 * locked/blocked states read as one system. Presentational and hookless
 * (see Global Constraints) — all state and data live in the container.
 */
export const CoverageNotice = ({ hit, total }: CoverageNoticeProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div
    role="status"
    className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-1/85 px-6 text-center"
  >
    <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      <Lock className="size-5" aria-hidden="true" />
    </span>
    <p className="text-base font-medium text-primary">You skipped ahead</p>
    <p className="text-sm text-secondary">
      You&rsquo;ve watched {hit} of {total} sections. Watch the parts you
      skipped to unlock this lesson&rsquo;s material.
    </p>
  </div>
);
