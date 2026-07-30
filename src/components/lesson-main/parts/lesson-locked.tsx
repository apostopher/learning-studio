import { Lock } from 'lucide-react';
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

type LessonLockedProps = {
  lessonName: string;
  courseSlug: string;
  lock: Extract<LockedMaterialResponse, { reason: 'lesson' | 'module' }>;
};

/**
 * A lesson the student has not reached yet: the player is not rendered, and
 * the reason names the lesson or module that clears it. Presentational and
 * hookless (see Global Constraints) — mirrors MaterialLocked's structure and
 * copy style, but rendered at the page level in place of the whole article
 * body, not just the material panel.
 */
export const LessonLocked = ({
  lessonName,
  courseSlug,
  lock,
}: LessonLockedProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <section
    role="status"
    className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-16 text-center"
  >
    <span className="flex size-12 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      <Lock className="size-6" aria-hidden="true" />
    </span>
    <h2 className="text-lg font-medium text-primary">{lessonName} is locked</h2>
    {lock.reason === 'lesson' ? (
      <p className="text-sm text-secondary">
        Finish{' '}
        <a
          className="text-primary underline underline-offset-2"
          href={`/course/${courseSlug}/modules/${lock.blockedBy.moduleSlug}/lessons/${lock.blockedBy.lessonSlug}`}
        >
          {lock.blockedBy.lessonName}
        </a>{' '}
        to unlock this lesson.
      </p>
    ) : (
      <p className="text-sm text-secondary">
        Finish the {lock.blockedBy.moduleName} module to unlock this lesson.
      </p>
    )}
  </section>
);
