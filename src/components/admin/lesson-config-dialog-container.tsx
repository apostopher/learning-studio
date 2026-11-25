import { useAtom, useSetAtom } from 'jotai';

import { configureLessonIdAtom, resetVideoSectionAtom } from '#/atoms/admin';
import type { BoardModule } from '#/lib/admin-schemas';
import { formatVersion } from '#/lib/lesson-version';
import { ConfigSectionContainer } from './lesson-config/config-section-container';
import { VideoSectionContainer } from './lesson-config/video-section-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';

/**
 * Big JIRA-style lesson configuration modal (tab sidebar + main panel): how
 * ONE course teaches a lesson. What the lesson is, this course only plays:
 * it is edited in Disciplines, and taken from there version by version.
 */
export const LessonConfigDialogContainer = ({
  courseId,
  modules,
}: {
  courseId: number;
  modules: BoardModule[];
}) => {
  const [lessonId, setLessonId] = useAtom(configureLessonIdAtom);
  const resetVideoSection = useSetAtom(resetVideoSectionAtom);
  // Only the course's own cards open this, and the same lesson can be in a
  // borrowed module too, with other settings.
  const parentModule =
    modules.find(
      (m) =>
        m.owner.id === courseId && m.lessons.some((l) => l.id === lessonId),
    ) ?? null;
  const lesson = parentModule?.lessons.find((l) => l.id === lessonId) ?? null;

  const sections: ConfigModalSection[] = [
    {
      value: 'material',
      title: 'Content',
      // `key`, here and below, is load-bearing rather than a list artefact:
      // this modal is mounted once and re-pointed at a different lesson, so
      // without it each section would carry the previous lesson's form state
      // over. It is what docs/use-effect-rules.md prescribes instead of an
      // effect that resets state when a prop changes.
      //
      content: lesson && (
        <div className="flex flex-col gap-8">
          <VideoSectionContainer
            key={`video-${lesson.id}`}
            courseId={courseId}
            source="course"
            readOnly
            lesson={lesson}
          />
          {lesson.videoProvider === null && (
            <p className="text-secondary text-sm">
              {`${formatVersion(lesson.version)} has no video.`}
            </p>
          )}
          <p className="text-secondary text-sm">
            {`Content is ${formatVersion(lesson.version)}. Edit it in Disciplines.`}
          </p>
        </div>
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
          // a dead-key verdict.
          resetVideoSection();
        }
      }}
      title="Configure lesson"
      heading={lesson?.name ?? ''}
      sections={sections}
      defaultSection="material"
    />
  );
};
