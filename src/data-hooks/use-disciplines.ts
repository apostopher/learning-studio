import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';
import {
  type LibraryLesson,
  libraryLessonSchema,
  STAFF_CANDIDATE_MIN_QUERY,
  SUBJECT_EXPERT_ROLE,
} from '#/lib/admin-schemas';
import {
  type CreateDisciplineFormValues,
  type DisciplineExpertPick,
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
 * Every mutation built on this helper invalidates the one listing key rather
 * than patching the cache. The listing carries a derived lesson count and a roster the
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
      // The editor's library pane is a second reader of the same rows: a
      // rename changes a column's heading and a delete removes the column
      // outright. Without this, the disciplines page updates and the editor
      // keeps showing the old name until its own staleTime elapses.
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
}

/**
 * Create a discipline and appoint its subject experts in one user-facing act.
 *
 * Two endpoints, not one: `POST /api/admin/disciplines` takes a name and
 * nothing else, and each expert is a separate `PUT …/staff`. The grants run
 * after the create because they need the id it returns, and they run
 * SEQUENTIALLY rather than in parallel so a rejected grant cannot race the
 * others' cache effects.
 *
 * A failed grant is COLLECTED, not thrown. By then the discipline exists, and
 * throwing would leave the caller unable to tell "nothing happened" from "the
 * discipline was created and two of three experts were appointed" — the second
 * of which must not be retried by resubmitting the form, since the name is now
 * taken and the create would 409. Only a failed CREATE rejects.
 *
 * Invalidation is `onSettled`, not `onSuccess`, for the same reason: the
 * discipline may exist even on the paths that reject later.
 */
export type CreateDisciplineWithExpertsResult = {
  discipline: AdminDiscipline;
  /** Experts the discipline was created WITHOUT, because their grant failed. */
  failedExperts: DisciplineExpertPick[];
};

export function useCreateDisciplineWithExperts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      experts,
    }: CreateDisciplineFormValues): Promise<CreateDisciplineWithExpertsResult> => {
      const res = await fetch('/api/admin/disciplines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) await readError(res, 'Could not create that discipline');
      const discipline = disciplineSchema.parse(await res.json());

      const failedExperts: DisciplineExpertPick[] = [];
      for (const expert of experts) {
        const granted = await fetch(
          `/api/admin/disciplines/${discipline.id}/staff`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: staffBody(expert.userId),
          },
        );
        if (!granted.ok) failedExperts.push(expert);
      }
      return { discipline, failedExperts };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: disciplineKeys.all() });
      // The editor's library pane is a different query against the same rows.
      // Without this the new discipline's column does not appear until the
      // library's own staleTime elapses, which reads as the button having
      // done nothing.
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    },
  });
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

/**
 * Create a lesson filed under one discipline, from the library column's own
 * "add lesson" action.
 *
 * Separate from `useCreateLesson`, which posts to a MODULE and refetches one
 * course board. This one creates an unplaced library lesson — it teaches no
 * course until someone drags it into one — so the only reader to invalidate
 * is the org library.
 *
 * The 403 is surfaced as its own sentence because it is the likeliest refusal
 * here and the one with a real remedy: the library admits anyone staffed
 * anywhere, while writing a lesson needs to be an admin or a subject expert of
 * THIS discipline. The message names both, so a course manager reading it
 * knows who to ask rather than only what they are not.
 */
export function useCreateLibraryLesson(disciplineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string }): Promise<LibraryLesson> => {
      const res = await fetch(
        `/api/admin/disciplines/${disciplineId}/lessons`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: input.name }),
        },
      );
      if (!res.ok) {
        await readError(
          res,
          res.status === 403
            ? 'Only an admin or one of this discipline’s subject experts can add lessons to it.'
            : 'Could not create that lesson',
        );
      }
      return libraryLessonSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
      // The disciplines page shows a lesson count per discipline, which this
      // has just changed.
      queryClient.invalidateQueries({ queryKey: disciplineKeys.all() });
    },
  });
}

/**
 * Bring one discipline's roster of subject experts to a chosen set, in one act.
 *
 * The editor's "Edit discipline" dialog hands over the whole list it wants
 * rather than individual grants and revocations, because that is what its
 * multi-select produces — a set, not a sequence of edits. Diffing it here
 * keeps the "which of these are new" arithmetic in one place instead of in
 * the dialog, and means the dialog can be re-submitted unchanged without
 * issuing a single request.
 *
 * Runs sequentially, and a failure stops the run: with several people moving
 * at once, "the third grant failed" is only actionable if the first two are
 * known to have landed. `onSettled` invalidates regardless, since a partial
 * run still changed the roster.
 */
export function useSetDisciplineExperts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      disciplineId,
      userIds,
      current,
    }: {
      disciplineId: number;
      userIds: string[];
      /** The roster as the server last reported it. */
      current: string[];
    }) => {
      const wanted = new Set(userIds);
      const held = new Set(current);
      const added = userIds.filter((id) => !held.has(id));
      const removed = current.filter((id) => !wanted.has(id));

      for (const userId of added) {
        const res = await fetch(
          `/api/admin/disciplines/${disciplineId}/staff`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: staffBody(userId),
          },
        );
        if (!res.ok) await readError(res, 'Could not add that subject expert');
      }
      for (const userId of removed) {
        const res = await fetch(
          `/api/admin/disciplines/${disciplineId}/staff`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: staffBody(userId),
          },
        );
        if (!res.ok) {
          await readError(res, 'Could not remove that subject expert');
        }
      }
      return { added: added.length, removed: removed.length };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: disciplineKeys.all() });
    },
  });
}

const staffCandidateSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});
export type DisciplineStaffCandidate = z.infer<typeof staffCandidateSchema>;

/**
 * How a person is named in every people picker on the discipline surfaces:
 * full name with the email in parentheses, or the email alone when the profile
 * carries no name.
 *
 * Exported rather than kept private to one screen because two pickers show the
 * same people — the disciplines page and the editor's create dialog — and a
 * second copy is a second place for the fallback rule to drift.
 */
export function staffCandidateLabel(
  candidate: DisciplineStaffCandidate,
): string {
  const name = [candidate.firstName, candidate.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name ? `${name} (${candidate.email})` : candidate.email;
}

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
