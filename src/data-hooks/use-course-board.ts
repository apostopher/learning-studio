import { useQuery } from '@tanstack/react-query';
import { courseBoardSchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

/** Modules + lessons for a course's editor board. `null` when the course doesn't exist. */
export function useCourseBoard(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseBoard(courseId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/courses/${courseId}/board`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
      return courseBoardSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
