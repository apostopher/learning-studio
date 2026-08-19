import {
  useAcknowledgeLevelChange,
  useMyLevel,
} from '#/data-hooks/use-my-level';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { AlertBar } from './alert-bar';
import { CourseLevelBanner } from './course-level-banner';

type CourseLevelBannerForCourseProps = {
  courseSlug: string;
};

/**
 * The data-fetching half of the level-change notice: `useMyLevel`'s
 * `pendingChange` feeds `CourseLevelBanner`, and dismissing it calls
 * `useAcknowledgeLevelChange` — both already existed from Task 7, wired up
 * here for the first time.
 *
 * Kept separate from `CourseLevelBannerContainer` (which extracts
 * `courseSlug` from routing) so this half needs only a `QueryClientProvider`
 * to render in a test, not a full router.
 */
export const CourseLevelBannerForCourse = ({
  courseSlug,
}: CourseLevelBannerForCourseProps) => {
  const { data } = useMyLevel(courseSlug);
  const acknowledge = useAcknowledgeLevelChange(courseSlug);
  const pending = data?.pendingChange ?? null;

  return (
    <AlertBar>
      {pending ? (
        <CourseLevelBanner
          level={LEVEL_LABELS[pending.level]}
          source={pending.source}
          message={pending.message}
          onDismiss={() => acknowledge.mutate(pending.id)}
        />
      ) : null}
    </AlertBar>
  );
};
