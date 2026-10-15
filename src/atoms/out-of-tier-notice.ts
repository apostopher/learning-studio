import { atom } from 'jotai';
import type { UserLevel } from '#/types';

/**
 * Set right before redirecting away from a lesson the pilot never completed
 * and that sits outside their current level (the `{ error: 'out-of-tier' }`
 * 403 from `/api/lesson/material`). `level` is null for a pilot with no
 * level in the course, whom strict levels close every lesson to.
 *
 * A jotai atom, not a URL search param, because the redirect target
 * (`/course/$courseSlug`) itself immediately redirects again via
 * `resumeCourseOrExplain` — a search param would not survive that second hop.
 * `CourseLayout` stays mounted across both hops (same `courseSlug`), so
 * reading this from there is the one place guaranteed to see it land.
 */
export const outOfTierNoticeAtom = atom<{ level: UserLevel | null } | null>(
  null,
);
