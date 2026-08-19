import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';
import { UserLevelSchema } from '#/types';

const myLevelSchema = z.object({
  level: UserLevelSchema,
  pendingChange: z
    .object({
      id: z.number(),
      level: UserLevelSchema,
      message: z.string().nullable(),
    })
    .nullable(),
});

export type MyLevel = z.infer<typeof myLevelSchema>;

/**
 * The signed-in pilot's current level for one course, plus any admin-issued
 * change they have not yet acknowledged. Backed by GET /api/user/my-level.
 * Disabled until `courseSlug` is non-empty, matching useCourseProgressSummary.
 */
export function useMyLevel(courseSlug: string) {
  return useQuery({
    queryKey: dataKeys.myLevel(courseSlug),
    queryFn: async (): Promise<MyLevel> => {
      const res = await fetch(
        `/api/user/my-level?slug=${encodeURIComponent(courseSlug)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load your level (${res.status})`);
      }
      return myLevelSchema.parse(await res.json());
    },
    enabled: courseSlug.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Dismiss an admin-issued level-change notice. No optimistic update — the
 * notice stays until the server confirms the acknowledgement, then this
 * invalidates useMyLevel so the next read reflects it.
 *
 * No caller yet: this task only wires the sidebar's read side
 * (useMyLevel). This mutation exists because Task 7 also creates the
 * `/api/user/level-acknowledge` endpoint it calls; the between-visits notice
 * that renders `pendingChange` and calls this hook to dismiss it is later work.
 */
export function useAcknowledgeLevelChange(courseSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: number) => {
      const res = await fetch('/api/user/level-acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId }),
      });
      if (!res.ok) {
        throw new Error(`Could not dismiss the level change (${res.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.myLevel(courseSlug),
      });
    },
  });
}
