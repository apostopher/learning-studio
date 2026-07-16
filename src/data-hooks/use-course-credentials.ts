import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { credentialSummarySchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

const courseCredentialsSchema = z.array(credentialSummarySchema);

/** Configured video-provider credentials for a course (secret-free summaries). */
export function useCourseCredentials(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseCredentials(courseId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/courses/${courseId}/credentials`);
      if (!res.ok)
        throw new Error(`Failed to load credentials (${res.status})`);
      return courseCredentialsSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
