import type { ReactNode } from 'react';
import type { AdminCourseSummary } from '#/lib/admin-schemas';
import { CoursePassMarkContainer } from './course-pass-mark-container';

/**
 * What a schedule card shows in its pass-mark slot: the editor, or nothing.
 *
 * `canEditPassMark` is `course:update` with the admin floor
 * (`hasOrgPermission`), the same guard the pass-mark endpoint uses. A course
 * manager who is not an admin can schedule a course but cannot change its
 * pass mark, so they are not offered a control that can only answer 403.
 */
export function coursePassMarkSlot(
  course: AdminCourseSummary,
  canEditPassMark: boolean,
): ReactNode {
  return canEditPassMark ? (
    <CoursePassMarkContainer course={course} />
  ) : undefined;
}
