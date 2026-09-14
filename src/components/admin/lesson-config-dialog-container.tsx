import { useAtom, useSetAtom } from 'jotai';

import { configureLessonIdAtom, resetVideoSectionAtom } from '@/atoms/admin';
import type { BoardModule } from '@/lib/admin-schemas';
import { ConfigSectionContainer } from './lesson-config/config-section-container';
import { MaterialSectionContainer } from './lesson-config/material-section-container';
import { VideoSectionContainer } from './lesson-config/video-section-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';

/** Big JIRA-style lesson configuration modal (tab sidebar + main panel). */
export const LessonConfigDialogContainer = ({
  courseId,
  modules,
}: {
  courseId: number;
  modules: BoardModule[];
}) => {
  const [lessonId, setLessonId] = useAtom(configureLessonIdAtom);
  const resetVideoSection = useSetAtom(resetVideoSectionAtom);
  const parentModule =
    modules.find((m) => m.lessons.some((l) => l.id === lessonId)) ?? null;
  const lesson = parentModule?.lessons.find((l) => l.id === lessonId) ?? null;

  const sections: ConfigModalSection[] = [
    {
      value: 'video',
      title: 'Video',
      // `key`, here and below, is load-bearing rather than a list artefact:
      // this modal is mounted once and re-pointed at a different lesson, so
      // without it each section would carry the previous lesson's form state
      // over. It is what docs/use-effect-rules.md prescribes instead of an
      // effect that resets state when a prop changes.
      content: lesson && (
        <VideoSectionContainer
          key={lesson.id}
          courseId={courseId}
          lesson={lesson}
        />
      ),
    },
    {
      value: 'material',
      title: 'Content',
      content: lesson && (
        <MaterialSectionContainer key={lesson.id} lesson={lesson} />
      ),
    },
    {
      value: 'config',
      title: 'Config',
      content: lesson && parentModule && (
        <ConfigSectionContainer
          key={lesson.id}
          courseId={courseId}
          lesson={lesson}
          module={parentModule}
        />
      ),
    },
  ];

  return (
    <SectionedConfigModal
      open={lessonId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setLessonId(null);
          // Cleared on the close EVENT, not from an effect watching the
          // modal's open state — reopening the same lesson should not restore
          // a half-finished "replace video" form.
          resetVideoSection();
        }
      }}
      title="Configure lesson"
      heading={lesson?.name ?? ''}
      sections={sections}
      // Content is what an admin opens a lesson to work on; video and
      // config are set once and rarely revisited.
      defaultSection="material"
    />
  );
};
