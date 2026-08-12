import { useAtom } from 'jotai';

import { configureLessonIdAtom } from '@/atoms/admin';
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
  const parentModule =
    modules.find((m) => m.lessons.some((l) => l.id === lessonId)) ?? null;
  const lesson = parentModule?.lessons.find((l) => l.id === lessonId) ?? null;

  const sections: ConfigModalSection[] = [
    {
      value: 'video',
      title: 'Video',
      content: lesson && (
        <VideoSectionContainer courseId={courseId} lesson={lesson} />
      ),
    },
    {
      value: 'material',
      title: 'Content',
      content: lesson && <MaterialSectionContainer lesson={lesson} />,
    },
    {
      value: 'config',
      title: 'Config',
      content: lesson && parentModule && (
        <ConfigSectionContainer
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
        if (!open) setLessonId(null);
      }}
      title="Configure lesson"
      heading={lesson?.name ?? ''}
      sections={sections}
    />
  );
};
