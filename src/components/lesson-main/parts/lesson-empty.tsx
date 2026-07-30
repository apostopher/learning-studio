import { BookOpen, Lock } from 'lucide-react';
import type { ResumeTarget } from '#/lib/course-resume';

type LessonEmptyProps = {
  courseSlug: string;
  /**
   * Taken as the whole `none` variant rather than a loose reason string, so
   * an `all-locked` state cannot be rendered without the lock explaining it.
   */
  state: Extract<ResumeTarget, { kind: 'none' }>;
};

/**
 * The terminal state for a course that cannot resume anyone: nothing is
 * published, or nothing is open to this learner yet.
 *
 * This replaced "Pick a lesson from the sidebar to begin." — which was not
 * merely a dead end but false in both cases, since there is nothing pickable
 * in the sidebar. The two cases are kept distinct because their remedies are
 * opposite: wait for an admin, versus go and finish a prerequisite.
 *
 * Presentational and hookless (see Global Constraints); mirrors LessonLocked's
 * structure and copy style.
 */
export const LessonEmpty = ({ courseSlug, state }: LessonEmptyProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <section
    role="status"
    className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-16 text-center"
  >
    <span className="flex size-12 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      {state.reason === 'no-lessons' ? (
        <BookOpen className="size-6" aria-hidden="true" />
      ) : (
        <Lock className="size-6" aria-hidden="true" />
      )}
    </span>
    {state.reason === 'no-lessons' ? (
      <>
        <h2 className="text-lg font-medium text-primary">No lessons yet</h2>
        <p className="text-sm text-secondary">
          This course doesn&rsquo;t have any lessons published yet. There is
          nothing to do here until it does.
        </p>
      </>
    ) : (
      <>
        <h2 className="text-lg font-medium text-primary">
          Nothing is open yet
        </h2>
        {state.lock.kind === 'lesson-locked' ? (
          <p className="text-sm text-secondary">
            Finish{' '}
            <a
              className="text-primary underline underline-offset-2"
              href={`/course/${courseSlug}/modules/${state.lock.moduleSlug}/lessons/${state.lock.lessonSlug}`}
            >
              {state.lock.lessonName}
            </a>{' '}
            first to unlock this course.
          </p>
        ) : state.lock.kind === 'module-locked' ? (
          <p className="text-sm text-secondary">
            Finish the {state.lock.moduleName} module first to unlock this
            course.
          </p>
        ) : (
          // Unreachable by construction: resolveResumeTarget only reports
          // all-locked when the first lesson's lock is NOT open. Kept as real
          // copy rather than exhaustive-checked away, because the alternative
          // is a heading with no explanation under it.
          <p className="text-sm text-secondary">
            Every lesson in this course is locked, and we can&rsquo;t determine
            what unlocks them. Please report this.
          </p>
        )}
      </>
    )}
  </section>
);
