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

type SetLevelBody = {
  courseId: number;
  level: string;
  message: string;
  note?: string;
};

/** Why a level write failed, in words the admin can act on. */
function levelWriteError(status: number): Error {
  // The UI offers the control only with `level:update`, so a 403 is the
  // endpoint's other refusal (`assertCanActOnProfile`): a target holding a
  // staff role, and an actor who is not the owner.
  if (status === 403) {
    return new Error(
      'Only an owner can change the level of someone with a staff role.',
    );
  }
  if (status === 404) {
    return new Error('That person or course no longer exists.');
  }
  if (status === 400) {
    return new Error('The level change was not valid. Check the message.');
  }
  return new Error(`Couldn't set the level (${status}).`);
}

async function putUserLevel(profileId: number, body: SetLevelBody) {
  const res = await fetch(`/api/admin/users/${profileId}/levels`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw levelWriteError(res.status);
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
    mutationFn: (input: SetLevelBody) => putUserLevel(profileId, input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.userLevelHistory(profileId, input.courseId),
      });
      invalidateUsers();
    },
  });
}

/**
 * `useSetUserLevel` for a surface listing many people — the scheduling
 * roster — where one mutation serves every row, so the profile travels in the
 * variables rather than the hook's argument. Same endpoint, same validation.
 *
 * Also invalidates the offerings, whose roster rows carry each person's level.
 */
export function useSetUserCourseLevel() {
  const queryClient = useQueryClient();
  const invalidateUsers = useInvalidateUsers();
  return useMutation({
    mutationFn: ({
      profileId,
      ...body
    }: SetLevelBody & { profileId: number }) => putUserLevel(profileId, body),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.userLevelHistory(input.profileId, input.courseId),
      });
      queryClient.invalidateQueries({ queryKey: dataKeys.allOfferings() });
      invalidateUsers();
    },
  });
}
