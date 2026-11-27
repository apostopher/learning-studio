import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';

const myOfferingSchema = z.object({
  /** `YYYY-MM-DD`; null when the user is on no offering of the course. */
  startsOn: z.string().nullable(),
});

/**
 * The start of the signed-in user's offering of one course, for its header.
 * Backed by GET /api/user/my-offering.
 */
export function useMyOffering(courseSlug: string) {
  return useQuery({
    queryKey: dataKeys.myOffering(courseSlug),
    queryFn: async () => {
      const res = await fetch(
        `/api/user/my-offering?slug=${encodeURIComponent(courseSlug)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load your offering (${res.status})`);
      }
      return myOfferingSchema.parse(await res.json());
    },
    enabled: courseSlug.length > 0,
    staleTime: 5 * 60_000,
  });
}
