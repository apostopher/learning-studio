import type { SkaProfileForPrompt } from '#/ai/prompts/viper7';
import { getCourseIdentityBySlug } from '#/db/course';
import {
  findLatestReviewedSkaProfile,
  findReviewedSkaProfile,
  findSkaProfile,
  saveSkaProfileReview,
} from '#/db/ska-profile';
import { type SkaProfileView, toSkaProfileView } from '#/lib/ska-profile';
import type { SkaProfile } from '#/types';

/**
 * Picks the SKA profile to inject into viper7 for one chat request, and which
 * of its sections apply.
 *
 * Two cases, and the difference between them is the whole reason this lives in
 * its own function:
 *
 * - **A course in context** — that course's reviewed profile, all three
 *   sections. This is the fully-personalised case.
 * - **No course in context** (the widget on `/app`) — the ATTITUDE ONLY, from
 *   whichever reviewed profile was updated most recently. Attitude describes
 *   the person and travels between courses; Skills and Knowledge describe what
 *   they brought to a particular course, and answering a question about one
 *   course using another course's material is worse than not personalising at
 *   all.
 *
 * Most-recently-updated resolves the multi-course case without a precedence
 * rule to remember: an edit bumps `updatedAt`, so a hand-written attitude
 * automatically outranks a generated one. Accepted consequence — two courses
 * can hold contradictory attitudes and only the newer is ever seen here. No
 * merge, on purpose: contradictory prose in a system prompt makes the model
 * incoherent, which is worse than being one course out of date.
 *
 * Returns undefined for "no profile", which every caller treats as ordinary.
 */
export const resolveChatSkaProfile = async ({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug?: string;
}): Promise<SkaProfileForPrompt | undefined> => {
  if (courseSlug) {
    const course = await getCourseIdentityBySlug(courseSlug);
    // An unresolvable slug falls through to the course-less branch rather than
    // throwing: the chat request itself is still perfectly valid, and taking
    // down a conversation over a bad slug would be a worse failure than
    // answering it with less context.
    if (course) {
      const row = await findReviewedSkaProfile({ userId, courseId: course.id });
      return row ? { profile: row } : undefined;
    }
  }

  const row = await findLatestReviewedSkaProfile({ userId });
  return row ? { profile: row, sections: ['attitude'] } : undefined;
};

export type SkaProfileResult =
  | { ok: true; profile: SkaProfileView | null }
  | { ok: false; reason: 'course_not_found' | 'profile_not_found' };

/**
 * The learner's own profile for a course, reviewed or not — what the course
 * page surface renders.
 *
 * `profile: null` (ok) and `profile_not_found` (not ok) are different answers
 * and both are needed: the first means "you have no profile", an ordinary
 * state with an ordinary empty rendering; the second is only ever produced by
 * a SAVE against a profile that no longer exists.
 *
 * SECURITY: `userId` is a parameter, never derived here, and the row is
 * resolved from (session user, slug) — so no request can name another user's
 * profile.
 */
export const getSkaProfileForCourse = async ({
  userId,
  courseSlug,
}: {
  userId: string;
  courseSlug: string;
}): Promise<SkaProfileResult> => {
  const course = await getCourseIdentityBySlug(courseSlug);
  if (!course) return { ok: false, reason: 'course_not_found' };

  const row = await findSkaProfile({ userId, courseId: course.id });
  return { ok: true, profile: row ? toSkaProfileView(row) : null };
};

/**
 * Saves the learner's edits and marks the profile reviewed — the one button.
 *
 * `profile_not_found` rather than an upsert when the row is gone. The only way
 * that happens is a withdrawal (`deleteOnboarding`) landing between load and
 * save, and re-creating the row here would resurrect, from a stale form in
 * another tab, precisely the data the user just asked to erase.
 */
export const reviewSkaProfile = async ({
  userId,
  courseSlug,
  profile,
}: {
  userId: string;
  courseSlug: string;
  profile: SkaProfile;
}): Promise<SkaProfileResult> => {
  const course = await getCourseIdentityBySlug(courseSlug);
  if (!course) return { ok: false, reason: 'course_not_found' };

  const updated = await saveSkaProfileReview({
    userId,
    courseId: course.id,
    profile,
  });

  if (!updated) return { ok: false, reason: 'profile_not_found' };

  return { ok: true, profile: toSkaProfileView(updated) };
};
