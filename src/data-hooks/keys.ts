/** Query-key factory for typesafe TanStack Query hooks in src/data-hooks/. */
export const dataKeys = {
  adminCourses: () => ['admin', 'courses'] as const,
  courseBoard: (courseId: number) =>
    ['admin', 'course-board', courseId] as const,
} as const;
