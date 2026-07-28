import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const myCourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  percent: z.number(),
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
  });
}
