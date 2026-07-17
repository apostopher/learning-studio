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
} as const;
