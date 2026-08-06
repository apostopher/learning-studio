import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { SkaProfile } from '#/types';
import { dataKeys } from './keys';

/**
 * Matches the `/api/course/ska-profile` payload. Declared inline per this
 * repo's convention rather than imported from the server module, so this hook
 * has no compile-time dependency on server-only code.
 *
 * `profile: null` is a valid, expected response — a learner with no profile.
 * It is modelled as null rather than as an error because generation is
 * best-effort by design and a thin interview can legitimately produce nothing.
 */
const skaProfileResponseSchema = z.object({
  profile: z
    .object({
      skills: z.string().nullable(),
      knowledge: z.string().nullable(),
      attitude: z.string().nullable(),
      reviewedAt: z.string().nullable(),
    })
    .nullable(),
});

export type SkaProfileView = NonNullable<
  z.infer<typeof skaProfileResponseSchema>['profile']
>;

const fetchSkaProfile = async (courseSlug: string) => {
  const res = await fetch(
    `/api/course/ska-profile?courseSlug=${encodeURIComponent(courseSlug)}`,
  );
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return skaProfileResponseSchema.parse(await res.json()).profile;
};

/**
 * The caller's own SKA profile for one course.
 *
 * `enabled` on a truthy slug so the course-page surface can mount before the
 * slug resolves without firing a request that would 400.
 */
export const useSkaProfile = (courseSlug: string) =>
  useQuery({
    queryKey: dataKeys.skaProfile(courseSlug),
    queryFn: () => fetchSkaProfile(courseSlug),
    enabled: courseSlug.length > 0,
    // Only this user changes it, and only through the mutation below — which
    // writes the server's response straight into the cache. There is no
    // background source of change to poll for.
    staleTime: Number.POSITIVE_INFINITY,
  });

/**
 * Saves edits and marks the profile reviewed — one request, because it is one
 * button and one user action. See the route for why the two cannot be split.
 *
 * `setQueryData` with the server's response rather than an invalidate: the
 * response already carries the authoritative row including the freshly stamped
 * `reviewedAt`, and re-fetching would leave the card briefly showing the
 * unreviewed banner for a profile the user just activated.
 */
export const useSaveSkaProfile = (courseSlug: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: SkaProfile) => {
      const res = await fetch('/api/course/ska-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseSlug, profile }),
      });

      if (res.status === 404) {
        throw new Error(
          'This profile is no longer available — it may have been deleted.',
        );
      }
      if (!res.ok) throw new Error(`Failed to save profile (${res.status})`);

      return skaProfileResponseSchema.parse(await res.json()).profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(dataKeys.skaProfile(courseSlug), profile);

      // The card renders in TWO places off TWO different caches: the course
      // page reads the key above, the chat widget reads the profile embedded
      // in the onboarding turn. Updating only one leaves the other showing a
      // stale `reviewedAt: null` — so a learner who saves from the chat card
      // would keep being told their profile is "not in use yet" immediately
      // after activating it, which is both wrong and alarming.
      //
      // Patched rather than invalidated: invalidating the onboarding key would
      // re-POST `start`, and this mutation already holds the authoritative row.
      queryClient.setQueryData<{ skaProfile?: unknown } | undefined>(
        dataKeys.onboardingSession(courseSlug),
        (previous) =>
          previous ? { ...previous, skaProfile: profile } : previous,
      );
    },
  });
};
