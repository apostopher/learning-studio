import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { credentialSummarySchema } from '@/lib/admin-schemas';
import { dataKeys } from './keys';

const courseCredentialsSchema = z.array(credentialSummarySchema);

/**
 * Configured video-provider credentials for a course (secret-free summaries).
 *
 * `null` disables the query: the library's lesson dialog has no course when
 * the lesson is placed nowhere yet, and there are then no credentials to ask
 * about — the video ref still saves, only the preview waits.
 */
export function useCourseCredentials(courseId: number | null) {
  return useQuery({
    queryKey: dataKeys.courseCredentials(courseId ?? 0),
    enabled: courseId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/admin/courses/${courseId}/credentials`);
      if (!res.ok)
        throw new Error(`Failed to load credentials (${res.status})`);
      return courseCredentialsSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}
