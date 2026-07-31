export const queryKeys = {
  courseDetails: (slug?: string) => ['course-details', slug],
  lessonPlayback: (lessonSlug: string) =>
    ['lesson-playback', lessonSlug] as const,
  lessonMaterial: (lessonSlug: string) =>
    ['lesson-material', lessonSlug] as const,
  aiTestResults: (lessonSlug: string) =>
    ['ai-test-results', lessonSlug] as const,
} as const;
