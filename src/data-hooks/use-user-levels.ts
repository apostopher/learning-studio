import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';
import { useInvalidateUsers } from '#/data-hooks/use-admin-users';
import { LevelSourceSchema, UserLevelSchema } from '#/types';

const historyRowSchema = z.object({
  id: z.number(),
  level: UserLevelSchema,
  source: LevelSourceSchema,
  message: z.string().nullable(),
  note: z.string().nullable(),
  changedBy: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type LevelHistoryRow = z.infer<typeof historyRowSchema>;

/**
 * Full level history for one pilot in one course, newest first.
 *
 * `courseId` is nullable because the disclosure it powers is closed by
 * default — the query stays disabled until a course row is actually opened,
 * so opening the modal never fires N history requests for N enrolled courses.
 */
export function useUserLevelHistory(
  profileId: number,
  courseId: number | null,
) {
  return useQuery({
    queryKey: dataKeys.userLevelHistory(profileId, courseId ?? 0),
    enabled: courseId !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<LevelHistoryRow[]> => {
      const res = await fetch(
        `/api/admin/users/${profileId}/levels?courseId=${courseId}`,
      );
      if (!res.ok) throw new Error('Could not load level history');
      const body = await res.json();
      return z.array(historyRowSchema).parse(body.history);
    },
  });
}

/**
 * Correct a pilot's level in one course.
 *
 * No optimistic update: a level change can hide lessons a pilot is mid-way
 * through, so the row should reflect what the server actually recorded, not
 * a guess that might have to be rolled back.
 */
export function useSetUserLevel(profileId: number) {
  const queryClient = useQueryClient();
  const invalidateUsers = useInvalidateUsers();
  return useMutation({
    mutationFn: async (input: {
      courseId: number;
      level: string;
      message: string;
      note?: string;
    }) => {
      const res = await fetch(`/api/admin/users/${profileId}/levels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Couldn't set the level");
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.userLevelHistory(profileId, input.courseId),
      });
      invalidateUsers();
    },
  });
}
