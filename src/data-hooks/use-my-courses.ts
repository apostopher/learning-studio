import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const resumeSchema = z.union([
  z.object({
    kind: z.literal('lesson'),
    moduleSlug: z.string(),
    lessonSlug: z.string(),
  }),
  z.object({ kind: z.literal('none') }).passthrough(),
]);

const myCourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  percent: z.number(),
  resume: resumeSchema,
});

export type MyCourse = z.infer<typeof myCourseSchema>;

/** The logged-in user's subscribed courses, each with an overall progress percent. */
export function useMyCourses() {
  return useQuery({
    queryKey: dataKeys.myCourses(),
    queryFn: async () => {
      const res = await fetch('/api/course/my-courses');
      if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
      return myCourseSchema.array().parse(await res.json());
    },
    staleTime: 60_000,
    // /app is the hub users land on right after finishing a lesson, so a
    // cached percentage here isn't merely stale — it's a visibly wrong
    // number on the page they just navigated to. Always refetch on arrival
    // and on refocus so it reflects reality. No refetchInterval: unlike the
    // course progress summary, nobody sits on /app watching it tick.
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
