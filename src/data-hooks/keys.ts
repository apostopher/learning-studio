/** Query-key factory for typesafe TanStack Query hooks in src/data-hooks/. */
export const dataKeys = {
  adminCourses: () => ['admin', 'courses'] as const,
  /**
   * Every per-course board at once — the prefix `courseBoard` is built on.
   *
   * Exists because a lesson is org-owned and can be taught by several courses:
   * deleting one invalidates EVERY board that was teaching it, and the caller
   * doing the deleting knows no course id at all. Invalidating this prefix is
   * the only correct answer there; naming one course would leave the others
   * showing a lesson the server has destroyed.
   */
  courseBoards: () => ['admin', 'course-board'] as const,
  courseBoard: (courseId: number) =>
    [...dataKeys.courseBoards(), courseId] as const,
  /**
   * Mutation key, not a query key: it lets a settling lesson-config write ask
   * whether it is the last one in flight before invalidating the board.
   */
  updateLessonConfig: (courseId: number) =>
    ['admin', 'update-lesson-config', courseId] as const,
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
  courseStaff: (courseId: number) =>
    ['admin', 'course-staff', courseId] as const,
  // Keyed by search term: each term is its own cached answer, which is what
  // lets the picker retype a prefix without re-hitting the server.
  courseStaffCandidates: (courseId: number, query: string) =>
    ['admin', 'course-staff-candidates', courseId, query] as const,
  // Accounts and pending invitees arrive together, so one key covers both.
  adminUsers: () => ['admin', 'users'] as const,
  userLevelHistory: (profileId: number, courseId: number) =>
    ['admin', 'user-level-history', profileId, courseId] as const,
  rolePermissions: () => ['admin', 'role-permissions'] as const,
  // Personas are org-level, so the list is not keyed by course — every course
  // in the active org sees the same set.
  personas: () => ['admin', 'personas'] as const,
  coursePersona: (courseId: number) =>
    ['admin', 'course-persona', courseId] as const,
  lessonProgress: (lessonSlug: string) =>
    ['user', 'video-progress', lessonSlug] as const,
  myLevel: (courseSlug: string) => ['user', 'my-level', courseSlug] as const,
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
  /**
   * The org-wide knowledge library (admin lesson catalog), not to be confused
   * with `library` above — that key is the unrelated, course-scoped learner
   * file library keyed by `courseSlug`. This one is org-scoped with no
   * parameter, so it cannot reuse that name without colliding.
   */
  orgLibrary: () => ['admin', 'library'] as const,
  editorBoard: () => ['admin', 'editor-board'] as const,
  /**
   * Mutation key for the org editor's quickshot chips. Separate from
   * `updateLessonConfig`, which is keyed per course: this board is not, and
   * sharing the key would make one board's in-flight count decide when the
   * other's optimistic values are reconciled.
   */
  updateEditorLessonConfig: () =>
    ['admin', 'editor-board', 'lesson-config'] as const,
} as const;
