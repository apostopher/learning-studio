import type { LessonRef } from '#/lib/lesson-ref';
import type { VideoLang } from '#/lib/video-languages';

export const queryKeys = {
  courseDetails: (slug?: string) => ['course-details', slug],
  // Keyed by course, lesson AND language: the URL is per course, and a
  // French request and an English one are two different videos.
  lessonPlayback: ({ courseSlug, lessonSlug }: LessonRef, lang: VideoLang) =>
    ['lesson-playback', courseSlug, lessonSlug, lang] as const,
  lessonMaterial: ({ courseSlug, lessonSlug }: LessonRef) =>
    ['lesson-material', courseSlug, lessonSlug] as const,
  aiTestResults: (lessonSlug: string) =>
    ['ai-test-results', lessonSlug] as const,
} as const;
