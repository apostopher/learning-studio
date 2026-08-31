import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  STAFF_CANDIDATE_MIN_QUERY,
  SUBJECT_EXPERT_ROLE,
} from '#/lib/admin-schemas';
import {
  type SetDisciplineStaffInput,
  setDisciplineStaffInputSchema,
} from '#/lib/discipline-schemas';

/**
 * Query keys for the discipline admin surface.
 *
 * Local to this module rather than added to `dataKeys` in `./keys.ts`: that
 * file was under concurrent review when this task landed. Both keys are
 * prefixed `['admin', …]` like every key in the factory, so a future move into
 * it is a cut and paste with no cache-shape change.
 */
const disciplineKeys = {
  all: () => ['admin', 'disciplines'] as const,
  // Keyed by search term, so retyping a prefix is answered from cache — the
  // same reason `courseStaffCandidates` is keyed that way.
  candidates: (query: string) =>
    ['admin', 'discipline-staff-candidates', query] as const,
};

/**
 * Error carrying the HTTP status and, for the one refusal that has a number
 * attached, the lesson count.
 *
 * `lessonCount` is read off the JSON body rather than parsed back out of the
 * message: the screen puts the count on the row it belongs to, and recovering
 * a number from a sentence is how a message and its data drift apart.
 */
export class DisciplineRequestError extends Error {
  status: number;
  lessonCount?: number;
  constructor(message: string, status: number, lessonCount?: number) {
    super(message);
    this.name = 'DisciplineRequestError';
    this.status = status;
    this.lessonCount = lessonCount;
  }
}

const disciplineStaffMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  roles: z.array(z.string()),
});

const disciplineSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  lessonCount: z.number(),
  staff: z.array(disciplineStaffMemberSchema),
});
export type AdminDiscipline = z.infer<typeof disciplineSchema>;

const disciplinesResponseSchema = z.object({
  disciplines: z.array(disciplineSchema),
  /**
   * Lessons with no discipline at all. Admin-only by design — a null
   * discipline sends `requireLessonContentPermission` to `requireAdmin` — so
   * this is the size of a triage queue only this screen's audience can clear.
   */
  unfiledLessonCount: z.number(),
});
export type DisciplinesResponse = z.infer<typeof disciplinesResponseSchema>;

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  let lessonCount: number | undefined;
  try {
    const body = (await res.json()) as {
      error?: unknown;
      lessonCount?: unknown;
    };
    if (typeof body.error === 'string') message = body.error;
    if (typeof body.lessonCount === 'number') lessonCount = body.lessonCount;
  } catch {
    // Non-JSON body (e.g. the plain "Forbidden") — keep the fallback.
  }
  throw new DisciplineRequestError(message, res.status, lessonCount);
}

/** Every discipline in the org with its lesson count and its subject experts. */
export function useDisciplines() {
  return useQuery({
    queryKey: disciplineKeys.all(),
    queryFn: async (): Promise<DisciplinesResponse> => {
      const res = await fetch('/api/admin/disciplines');
      if (!res.ok) await readError(res, 'Could not load disciplines');
      return disciplinesResponseSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}

/**
 * Every mutation below invalidates the one listing key rather than patching
 * the cache. The listing carries a derived lesson count and a roster the
 * server assembles from three tables; predicting either here would show a
 * number the database never agreed to.
 */
function useDisciplineMutation<TVars>(
  request: (vars: TVars) => Promise<Response>,
  fallback: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const res = await request(vars);
      if (!res.ok) await readError(res, fallback);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: disciplineKeys.all() });
    },
  });
}

export function useCreateDiscipline() {
  return useDisciplineMutation(
    (name: string) =>
      fetch('/api/admin/disciplines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    'Could not create that discipline',
  );
}

export function useRenameDiscipline() {
  return useDisciplineMutation(
    ({ disciplineId, name }: { disciplineId: number; name: string }) =>
      fetch(`/api/admin/disciplines/${disciplineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    'Could not rename that discipline',
  );
}

/**
 * Delete. Refused with a 409 while the discipline still holds lessons — the
 * error's `lessonCount` is what the screen shows next to the row.
 */
export function useDeleteDiscipline() {
  return useDisciplineMutation(
    (disciplineId: number) =>
      fetch(`/api/admin/disciplines/${disciplineId}`, { method: 'DELETE' }),
    'Could not delete that discipline',
  );
}

function staffBody(userId: string): string {
  return JSON.stringify(
    setDisciplineStaffInputSchema.parse({
      userId,
      role: SUBJECT_EXPERT_ROLE,
    } satisfies SetDisciplineStaffInput),
  );
}

export function useGrantDisciplineExpert() {
  return useDisciplineMutation(
    ({ disciplineId, userId }: { disciplineId: number; userId: string }) =>
      fetch(`/api/admin/disciplines/${disciplineId}/staff`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: staffBody(userId),
      }),
    'Could not add that subject expert',
  );
}

export function useRevokeDisciplineExpert() {
  return useDisciplineMutation(
    ({ disciplineId, userId }: { disciplineId: number; userId: string }) =>
      fetch(`/api/admin/disciplines/${disciplineId}/staff`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: staffBody(userId),
      }),
    'Could not remove that subject expert',
  );
}

const staffCandidateSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});
export type DisciplineStaffCandidate = z.infer<typeof staffCandidateSchema>;

/**
 * People who may be appointed a subject expert, by search term.
 *
 * Disabled below the minimum term rather than debounced: the request only ever
 * fires for a search the server would accept, and React Query caches per term.
 */
export function useDisciplineStaffCandidates(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: disciplineKeys.candidates(trimmed),
    queryFn: async (): Promise<DisciplineStaffCandidate[]> => {
      const res = await fetch(
        `/api/admin/discipline-staff-candidates?q=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) await readError(res, 'Could not search for people');
      return staffCandidateSchema.array().parse(await res.json());
    },
    enabled: trimmed.length >= STAFF_CANDIDATE_MIN_QUERY,
    staleTime: 30_000,
  });
}
