import { Lock } from 'lucide-react';
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

type MaterialLockedProps = {
  lock: LockedMaterialResponse;
  courseSlug: string;
};

/**
 * Why this lesson's material is locked, and what clears it.
 *
 * Presentational and hookless by design (react-compiler + vitest null the
 * dispatcher for our src/ components that call a hook directly, so a hook
 * here would make this untestable). Every branch states a reason and an
 * action — a lock icon with no explanation is the failure mode this exists
 * to prevent.
 */
export const MaterialLocked = ({ lock, courseSlug }: MaterialLockedProps) => {
  const body =
    lock.reason === 'video' ? (
      <p className="text-sm text-secondary">
        Watch the video to unlock the key points, quiz, and the rest of this
        lesson&rsquo;s material.
      </p>
    ) : lock.reason === 'lesson' ? (
      <p className="text-sm text-secondary">
        Finish{' '}
        <a
          className="text-primary underline underline-offset-2"
          href={`/course/${courseSlug}/modules/${lock.blockedBy.moduleSlug}/lessons/${lock.blockedBy.lessonSlug}`}
        >
          {lock.blockedBy.lessonName}
        </a>{' '}
        first to unlock this lesson&rsquo;s material.
      </p>
    ) : (
      <p className="text-sm text-secondary">
        Finish the {lock.blockedBy.moduleName} module first to unlock this
        lesson&rsquo;s material.
      </p>
    );

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <p className="text-base font-medium text-primary">Material locked</p>
      {body}
    </div>
  );
};
