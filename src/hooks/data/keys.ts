export const queryKeys = {
  courseDetails: (slug?: string) => ['course-details', slug],
  courseProgress: (slug?: string) => ['course-progress', slug],
  lessonVideo: (videoId: string) => ['lesson-video', videoId] as const,
  lessonMaterial: (lessonSlug: string) =>
    ['lesson-material', lessonSlug] as const,
  aiTestResults: (lessonSlug: string) =>
    ['ai-test-results', lessonSlug] as const,
} as const;
