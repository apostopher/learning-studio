/** Query-key factory for typesafe TanStack Query hooks in src/data-hooks/. */
export const dataKeys = {
  adminCourses: () => ['admin', 'courses'] as const,
  courseBoard: (courseId: number) =>
    ['admin', 'course-board', courseId] as const,
  courseCredentials: (courseId: number) =>
    ['admin', 'course-credentials', courseId] as const,
  lessonPlayback: (lessonId: number) =>
    ['admin', 'lesson-playback', lessonId] as const,
  lessonMaterial: (lessonId: number) =>
    ['admin', 'lesson-material', lessonId] as const,
  courseEmbeddings: (courseId: number) =>
    ['admin', 'course-embeddings', courseId] as const,
  courseOnboarding: (courseId: number) =>
    ['admin', 'course-onboarding', courseId] as const,
  lessonProgress: (lessonSlug: string) =>
    ['user', 'video-progress', lessonSlug] as const,
  courseProgressSummary: (slug: string) =>
    ['course', 'progress-summary', slug] as const,
  myCourses: () => ['user', 'my-courses'] as const,
  onboardingSession: (courseSlug: string) =>
    ['user', 'onboarding-session', courseSlug] as const,
  onboardingProgress: (courseSlug: string) =>
    ['user', 'onboarding-progress', courseSlug] as const,
  chats: () => ['user', 'chats'] as const,
  chatMessages: (chatId: string) => ['user', 'chat-messages', chatId] as const,
  subscribedSlugs: () => ['user', 'subscribed-slugs'] as const,
  courseResume: (courseSlug: string) =>
    ['course', 'resume', courseSlug] as const,
  lessonQuizResult: (lessonSlug: string) =>
    ['user', 'lesson-quiz-result', lessonSlug] as const,
} as const;
