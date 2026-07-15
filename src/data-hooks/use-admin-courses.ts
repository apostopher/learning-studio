import { useQuery } from '@tanstack/react-query';
import { adminCourseSummarySchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** All courses with module/lesson counts, for the admin grid. */
export function useAdminCourses() {
  return useQuery({
    queryKey: dataKeys.adminCourses(),
    queryFn: async () => {
      const res = await fetch('/api/admin/courses');
      if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
      return adminCourseSummarySchema.array().parse(await res.json());
    },
    staleTime: 60_000,
  });
}
