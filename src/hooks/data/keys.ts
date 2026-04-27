export const queryKeys = {
  courseDetails: (slug?: string) => ["course-details", slug],
  courseProgress: (slug?: string) => ["course-progress", slug],
} as const;