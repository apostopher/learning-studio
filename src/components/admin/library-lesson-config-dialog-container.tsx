import { useAtom } from 'jotai';

import { editLibraryLessonIdAtom } from '#/atoms/admin';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { LibraryDetailsSectionContainer } from './lesson-config/library-details-section-container';
import { MaterialSectionContainer } from './lesson-config/material-section-container';
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
    ...library.disciplines.flatMap((d) => d.lessons),
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
 * **Video is deliberately absent.** Setting a lesson's video ref is
 * lesson-scoped and content-guarded, but the section around it is not: it
 * reads `/api/admin/courses/:id/credentials`, because a provider credential
 * belongs to a course, and it hands off to the credential flow when the course
 * holds none. There is no course here to ask, and a lesson in zero courses has
 * no credential source at all. On top of that the editor board strips
 * `videoProvider`/`videoRef` from every lesson it ships
 * (`editorBoardLessonSchema`), so this screen could not populate the form even
 * if the credentials question were answered. Video stays where the course is.
 *
 * It reads the lesson out of the library query rather than taking it as a
 * prop, so the pencil on either pane needs only to set an id — and both panes
 * open the same modal against the same cached row.
 */
export const LibraryLessonConfigDialogContainer = () => {
  const [lessonId, setLessonId] = useAtom(editLibraryLessonIdAtom);
  const { data: library } = useOrgLibrary();
  const lesson = findLesson(library, lessonId);

  const sections: ConfigModalSection[] = [
    {
      value: 'details',
      title: 'Details',
      content: lesson && <LibraryDetailsSectionContainer lesson={lesson} />,
    },
    {
      value: 'material',
      title: 'Content',
      content: lesson && <MaterialSectionContainer lesson={lesson} />,
    },
  ];

  return (
    <SectionedConfigModal
      open={lessonId !== null}
      onOpenChange={(open) => {
        if (!open) setLessonId(null);
      }}
      title="Edit lesson"
      heading={lesson?.name ?? ''}
      sections={sections}
    />
  );
};
