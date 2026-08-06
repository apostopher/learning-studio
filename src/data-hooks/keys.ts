/** Query-key factory for typesafe TanStack Query hooks in src/data-hooks/. */
export const dataKeys = {
  adminCourses: () => ['admin', 'courses'] as const,
  courseBoard: (courseId: number) =>
    ['admin', 'course-board', courseId] as const,
  courseCredentials: (courseId: number) =>
    ['admin', 'course-credentials', courseId] as const,
  lessonPlayback: (lessonId: number) =>
    ['admin', 'lesson-playback', lessonId] as const,
  lessonPosters: (courseId: number) =>
    ['admin', 'lesson-posters', courseId] as const,
  lessonMaterial: (lessonId: number) =>
    ['admin', 'lesson-material', lessonId] as const,
  courseEmbeddings: (courseId: number) =>
    ['admin', 'course-embeddings', courseId] as const,
  courseOnboarding: (courseId: number) =>
    ['admin', 'course-onboarding', courseId] as const,
  courseNewsSources: (courseId: number) =>
    ['admin', 'course-news-sources', courseId] as const,
  // Accounts and pending invitees arrive together, so one key covers both.
  adminUsers: () => ['admin', 'users'] as const,
  rolePermissions: () => ['admin', 'role-permissions'] as const,
  // Personas are org-level, so the list is not keyed by course — every course
  // in the active org sees the same set.
  personas: () => ['admin', 'personas'] as const,
  coursePersona: (courseId: number) =>
    ['admin', 'course-persona', courseId] as const,
  lessonProgress: (lessonSlug: string) =>
    ['user', 'video-progress', lessonSlug] as const,
  courseProgressSummary: (slug: string) =>
    ['course', 'progress-summary', slug] as const,
  myCourses: () => ['user', 'my-courses'] as const,
  onboardingSession: (courseSlug: string) =>
    ['user', 'onboarding-session', courseSlug] as const,
  onboardingProgress: (courseSlug: string) =>
    ['user', 'onboarding-progress', courseSlug] as const,
  skaProfile: (courseSlug: string) =>
    ['user', 'ska-profile', courseSlug] as const,
  chats: () => ['user', 'chats'] as const,
  chatMessages: (chatId: string) => ['user', 'chat-messages', chatId] as const,
  subscribedSlugs: () => ['user', 'subscribed-slugs'] as const,
  courseResume: (courseSlug: string) =>
    ['course', 'resume', courseSlug] as const,
  lessonQuizResult: (lessonSlug: string) =>
    ['user', 'lesson-quiz-result', lessonSlug] as const,
  library: (courseSlug: string) => ['course', 'library', courseSlug] as const,
  courseNews: (courseSlug: string) => ['course', 'news', courseSlug] as const,
} as const;
