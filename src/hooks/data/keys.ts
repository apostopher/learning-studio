import type { LessonRef } from '#/lib/lesson-ref';

export const queryKeys = {
  courseDetails: (slug?: string) => ['course-details', slug],
  // Keyed by course AND lesson: the playback URL and the material's gate
  // answer are per course, so the same lesson in two courses is two entries.
  lessonPlayback: ({ courseSlug, lessonSlug }: LessonRef) =>
    ['lesson-playback', courseSlug, lessonSlug] as const,
  lessonMaterial: ({ courseSlug, lessonSlug }: LessonRef) =>
    ['lesson-material', courseSlug, lessonSlug] as const,
  aiTestResults: (lessonSlug: string) =>
    ['ai-test-results', lessonSlug] as const,
} as const;
