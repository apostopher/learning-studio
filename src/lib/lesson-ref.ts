/**
 * A lesson as the learner's route names it: `/course/$courseSlug/…/$lessonSlug`.
 *
 * The course is part of the identity, not context. A lesson can be placed in
 * several courses, and everything the learner path asks about it — whether it
 * is gated, which credentials sign its video, where the resume pointer goes —
 * is answered per course. So every request to the lesson endpoints carries
 * both slugs, and every client cache entry is keyed by both, so two courses
 * teaching one lesson never share an answer.
 */
export type LessonRef = {
  courseSlug: string;
  lessonSlug: string;
};

/** Structural equality, for `atomFamily`s keyed by a `LessonRef`. */
export const sameLessonRef = (a: LessonRef, b: LessonRef): boolean =>
  a.courseSlug === b.courseSlug && a.lessonSlug === b.lessonSlug;
