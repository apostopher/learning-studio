import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import { useSectionTapRecorder } from '#/data-hooks/use-record-section-tap';
import { queryKeys } from '#/hooks/data/keys';
import { useCourseDetails } from '#/hooks/data/use-course-details';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { computeMaterialPanelState } from './compute-material-panel-state';
import { LessonMaterialView } from './lesson-material';
import { LessonMaterialSkeleton } from './lesson-material-skeleton';
import { AdminPreviewNote } from './parts/admin-preview-note';
import { MaterialLocked } from './parts/material-locked';

type LessonMaterialWrapperProps = {
  lessonSlug: string;
  courseSlug: string;
};

export const LessonMaterialWrapper = ({
  lessonSlug,
  courseSlug,
}: LessonMaterialWrapperProps) => {
  const queryClient = useQueryClient();
  const query = useLessonMaterial(lessonSlug);
  const details = useCourseDetails(courseSlug);
  const tabsRef = useRef<HTMLDivElement>(null);

  lessonMaterialRef.current = tabsRef.current;

  // Lesson slugs are globally unique (`lessons.slug` carries a UNIQUE
  // constraint), so this needs no module to scope it — which is just as well,
  // since this component is never given one.
  const lesson = details.data?.modules
    .flatMap((mod) => mod.lessons)
    .find((l) => l.slug === lessonSlug);

  const state = computeMaterialPanelState(query);

  // Only record taps once the panel is actually showing material. A tab the
  // learner never saw must not count toward their progress, and `state.kind`
  // is the one place that fact is already decided.
  const recordSectionTap = useSectionTapRecorder({
    lessonSlug,
    enabled: state.kind === 'ready',
  });

  const onRetry = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.lessonMaterial(lessonSlug),
    });
  }, [queryClient, lessonSlug]);

  switch (state.kind) {
    case 'loading':
      return <LessonMaterialSkeleton />;
    // This used to `return null` — a blank panel with no message and no retry,
    // which is the silent failure the governing UX principle forbids. It also
    // matters more now that the branch has a real 500 path
    // (lesson-gating.server.ts throws on a missing cached payload).
    case 'error':
      return (
        <LessonError
          message={state.message}
          onRetry={onRetry}
          subject="this lesson"
        />
      );
    case 'locked':
      return <MaterialLocked lock={state.lock} courseSlug={courseSlug} />;
    case 'ready':
      return (
        <>
          {state.adminBypass ? <AdminPreviewNote /> : null}
          <LessonMaterialView
            material={state.material}
            tabsRef={tabsRef}
            // Defaults to the authored quiz while the course payload is still
            // in flight. Failing the other way would flash a Debrief tab on
            // lessons that have none, and briefly hide a quiz that does exist.
            hasDebrief={lesson?.hasDebrief ?? false}
            onTabSelected={recordSectionTap}
          />
        </>
      );
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};
