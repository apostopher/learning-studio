import { useQuery } from '@tanstack/react-query';
import { listAdminCoursesFn } from '@/lib/admin-functions';
import { dataKeys } from './keys';

/** All courses with module/lesson counts, for the admin grid. */
export function useAdminCourses() {
  return useQuery({
    queryKey: dataKeys.adminCourses(),
    queryFn: () => listAdminCoursesFn(),
    staleTime: 60_000,
  });
}
