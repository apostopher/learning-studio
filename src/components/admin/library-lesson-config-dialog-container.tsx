import { useAtom, useSetAtom } from 'jotai';

import {
  discardLessonVersionAtom,
  editLibraryLessonIdAtom,
  resetVideoSectionAtom,
} from '#/atoms/admin';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import { disciplineLessons, type LibraryLesson } from '#/lib/admin-schemas';
import { MaterialSaveButtonContainer } from './lesson-config/material-save-button-container';
import { MaterialSectionContainer } from './lesson-config/material-section-container';
import { VideoSectionContainer } from './lesson-config/video-section-container';
import { LibraryLessonHeadingContainer } from './library-lesson-heading-container';
import {
  type ConfigModalSection,
  SectionedConfigModal,
} from './sectioned-config-modal';

/** The lesson behind the open modal, found across every column of the library. */
function findLesson(
  library: ReturnType<typeof useOrgLibrary>['data'],
  lessonId: number | null,
): LibraryLesson | null {
  if (!library || lessonId === null) return null;
  const all = [
    ...library.untitled,
    ...library.disciplines.flatMap((d) => disciplineLessons(d)),
  ];
  return all.find((lesson) => lesson.id === lessonId) ?? null;
}

/**
 * Editing what a lesson IS, from the org-level editor — RBAC rule 6, the
 * surface that lets a discipline SME edit their own lesson from either pane
 * of `/admin/editor` without holding authority over any course.
 *
 * The lesson-level sibling of `LessonConfigDialogContainer`, and the split
 * between them is the point:
 *
 * - **Here**: the name and availability, plus the lesson's written content.
 *   Every one of these has the same answer in every course teaching the
 *   lesson, and every write behind them is guarded by
 *   `requireLessonContentPermission` — so an SME passes on their own
 *   discipline and needs no `course_staff` row.
 * - **There**: gates and sequencing, which describe how ONE course teaches the
 *   lesson, plus video.
 *
 * **Video sits at the top of Content.** Setting a lesson's video ref is
 * lesson-scoped and content-guarded, so it belongs here as much as the
 * material does. What is NOT lesson-scoped is the preview: playback URLs are
 * signed by a course's provider credentials, and the credential hand-off
 * asks a course. This dialog has no course of its own, so it signs with the
 * FIRST course teaching the lesson (`courseIds[0]`, ascending — stable across
 * refetches) and says so when there are several. Only the signature is that
 * course's: the video is the working copy's, whatever version it is on. A
 * lesson placed nowhere yet saves its ref without a preview, and the section
 * explains why.
 *
 * **The version** sits under the video. A version a course has taken is
 * locked: every write here of what a course would get (material, video, a
 * language, the name) asks `useVersionGate` first. Settings do not.
 *
 * It reads the lesson out of the library query rather than taking it as a
 * prop, so the pencil on either pane needs only to set an id — and both panes
 * open the same modal against the same cached row.
 */
export const LibraryLessonConfigDialogContainer = () => {
  const [lessonId, setLessonId] = useAtom(editLibraryLessonIdAtom);
  const resetVideoSection = useSetAtom(resetVideoSectionAtom);
  const discardVersion = useSetAtom(discardLessonVersionAtom);
  const { data: library } = useOrgLibrary();
  const lesson = findLesson(library, lessonId);

  // One section and no sidebar: the name and availability that were a
  // Details tab now live in the heading, and Save sits in the header beside
  // Close. `key` is load-bearing, not a list artefact: this modal is mounted
  // once for the whole editor and re-pointed at a different lesson, so
  // without it the sections would keep the previous lesson's form state.
  // Keying on the id is what docs/use-effect-rules.md prescribes in place of
  // an effect that resets state when a prop changes.
  const sections: ConfigModalSection[] = [
    {
      value: 'material',
      title: 'Content',
      content: lesson && (
        <div className="flex flex-col gap-8">
          <VideoSectionContainer
            key={`video-${lesson.id}`}
            courseId={lesson.courseIds[0] ?? null}
            source="discipline"
            lesson={lesson}
            versioned={lesson}
            previewNote={
              lesson.courseIds.length > 1
                ? `Preview is signed with the first of the ${lesson.courseIds.length} courses teaching this lesson.`
                : undefined
            }
          />
          <MaterialSectionContainer
            key={lesson.id}
            lesson={lesson}
            versioned={lesson}
          />
        </div>
      ),
    },
  ];

  return (
    <SectionedConfigModal
      open={lessonId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setLessonId(null);
          // Cleared on the close EVENT, as the course dialog does — reopening
          // should not restore a half-finished "replace video" form.
          resetVideoSection();
          if (lessonId !== null) discardVersion(lessonId);
        }
      }}
      title="Edit lesson"
      heading={lesson?.name ?? ''}
      headingSlot={
        lesson && (
          <LibraryLessonHeadingContainer key={lesson.id} lesson={lesson} />
        )
      }
      headerActions={
        lesson && (
          <MaterialSaveButtonContainer
            key={lesson.id}
            lessonId={lesson.id}
            version={lesson.version}
          />
        )
      }
      sections={sections}
    />
  );
};
