import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { LessonError } from '#/components/lesson-main/parts/lesson-error';
import { queryKeys } from '#/hooks/data/keys';
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
  const tabsRef = useRef<HTMLDivElement>(null);

  lessonMaterialRef.current = tabsRef.current;

  const onRetry = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.lessonMaterial(lessonSlug),
    });
  }, [queryClient, lessonSlug]);

  const state = computeMaterialPanelState(query);

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
          <LessonMaterialView material={state.material} tabsRef={tabsRef} />
        </>
      );
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};
