import type { LessonRef } from '#/lib/lesson-ref';
import type { VideoLang } from '#/lib/video-languages';

export const queryKeys = {
  /** Every course's details: the prefix of the key below. Likewise the rest. */
  allCourseDetails: () => ['course-details'] as const,
  courseDetails: (slug?: string) => ['course-details', slug],
  allLessonPlaybacks: () => ['lesson-playback'] as const,
  // Keyed by course, lesson AND language: the URL is per course, and a
  // French request and an English one are two different videos.
  lessonPlayback: ({ courseSlug, lessonSlug }: LessonRef, lang: VideoLang) =>
    ['lesson-playback', courseSlug, lessonSlug, lang] as const,
  allLessonMaterials: () => ['lesson-material'] as const,
  lessonMaterial: ({ courseSlug, lessonSlug }: LessonRef) =>
    ['lesson-material', courseSlug, lessonSlug] as const,
} as const;
