import { useQuery } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { type CourseBoard, courseBoardSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * The answer this hook can give, beyond a board.
 *
 * `null` is "no such course"; `BOARD_FORBIDDEN` is "you may not read this
 * one" — two different sentences the reader needs, and a 403 used to be thrown
 * as a failure so an SME who bookmarked the editor for a course they do not
 * staff was told "Failed to load the board." A refusal is not a failure, and
 * a locked state has to say what unlocks it.
 *
 * A sentinel rather than a wrapper object because the board cache is read back
 * as a `CourseBoard` by the optimistic mutations (`useUpdateLessonConfig`,
 * `useMoveLesson`, …); re-shaping the cached value would touch all of them for
 * a state none of them can be in — nothing that mutates the board is rendered
 * until a board has loaded.
 */
export const BOARD_FORBIDDEN = 'forbidden' as const;
export type CourseBoardResult = CourseBoard | typeof BOARD_FORBIDDEN | null;

/** Modules + lessons for a course's editor board. */
export function useCourseBoard(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseBoard(courseId),
    queryFn: async (): Promise<CourseBoardResult> => {
      const res = await fetch(`/api/admin/courses/${courseId}/board`);
      if (res.status === 404) return null;
      // Not thrown: `structure:read` is course-scoped, so a 403 here is the
      // ordinary answer for staff on a different course — the same treatment
      // `useCourseStaff` gives its own 403.
      if (res.status === 403) return BOARD_FORBIDDEN;
      if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
      return courseBoardSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
