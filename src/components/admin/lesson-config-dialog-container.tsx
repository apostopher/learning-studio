import { useAtom } from 'jotai';

import { configureLessonIdAtom } from '@/atoms/admin';
import type { BoardLesson } from '@/lib/admin-schemas';
import { VideoSectionContainer } from './lesson-config/video-section-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';

/** Sections whose real controls don't exist yet — a dashed placeholder panel. */
const PLACEHOLDER_SECTIONS: { value: string; title: string; hint: string }[] = [
  {
    value: 'availability',
    title: 'Availability',
    hint: 'Publish state and release rules.',
  },
  {
    value: 'access',
    title: 'Access',
    hint: 'Which subscriptions unlock this lesson.',
  },
  { value: 'debrief', title: 'Debrief', hint: 'Post-lesson debrief settings.' },
];

/** Big JIRA-style lesson configuration modal (tab sidebar + main panel). */
export const LessonConfigDialogContainer = ({
  courseId,
  lessons,
}: {
  courseId: number;
  lessons: BoardLesson[];
}) => {
  const [lessonId, setLessonId] = useAtom(configureLessonIdAtom);
  const lesson = lessons.find((l) => l.id === lessonId) ?? null;

  const sections: ConfigModalSection[] = [
    {
      value: 'video',
      title: 'Video',
      content: lesson && (
        <VideoSectionContainer courseId={courseId} lesson={lesson} />
      ),
    },
    ...PLACEHOLDER_SECTIONS.map((section) => ({
      value: section.value,
      title: section.title,
      content: (
        <div className="flex h-full items-center justify-center rounded-lg border border-gray-6 border-dashed p-8 text-center text-gray-10 text-sm">
          {section.hint}
        </div>
      ),
    })),
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
