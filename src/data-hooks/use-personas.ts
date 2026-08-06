import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type AdminPersona,
  adminPersonaSchema,
  type PersonaContentInput,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';

const listSchema = z.array(adminPersonaSchema);

/** Error carrying a field name, so a form can mark the offending input. */
export class PersonaRequestError extends Error {
  field?: string;
  status: number;
  constructor(message: string, status: number, field?: string) {
    super(message);
    this.name = 'PersonaRequestError';
    this.status = status;
    this.field = field;
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  let field: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown; field?: unknown };
    if (typeof body.error === 'string') message = body.error;
    if (typeof body.field === 'string') field = body.field;
  } catch {
    // Non-JSON body (e.g. the plain "Forbidden") — keep the fallback.
  }
  throw new PersonaRequestError(message, res.status, field);
}

/** Every persona in the active org. Org-level, so not keyed by course. */
export function usePersonas() {
  return useQuery({
    queryKey: dataKeys.personas(),
    queryFn: async (): Promise<AdminPersona[]> => {
      const res = await fetch('/api/admin/personas');
      if (!res.ok)
        await readError(res, `Failed to load personas (${res.status})`);
      return listSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}

export function useCreatePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<AdminPersona> => {
      const res = await fetch('/api/admin/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) await readError(res, 'Could not create persona');
      return adminPersonaSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.personas() });
    },
  });
}

export function useRenamePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { personaId: number; name: string }) => {
      const res = await fetch(`/api/admin/personas/${vars.personaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: vars.name }),
      });
      if (!res.ok) await readError(res, 'Could not rename persona');
      return adminPersonaSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.personas() });
    },
  });
}

export function useDeletePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personaId: number) => {
      const res = await fetch(`/api/admin/personas/${personaId}`, {
        method: 'DELETE',
      });
      if (!res.ok) await readError(res, 'Could not delete persona');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.personas() });
      // A deleted persona nulls every course selection pointing at it, so any
      // cached course selection is now wrong — including courses other than
      // the one whose modal is open.
      queryClient.invalidateQueries({
        queryKey: ['admin', 'course-persona'],
        exact: false,
      });
    },
  });
}

/**
 * Autosave. Writes `draftContent` only, so nothing here reaches a live prompt.
 *
 * Deliberately does **not** invalidate the personas list: it fires while the
 * admin is typing, and a refetch would swap `defaultValues` under an open
 * form. The list is refreshed on publish, discard, and modal close instead.
 */
export function useSavePersonaDraft() {
  return useMutation({
    mutationFn: async (vars: {
      personaId: number;
      draft: PersonaContentInput;
    }) => {
      const res = await fetch(`/api/admin/personas/${vars.personaId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars.draft),
      });
      if (!res.ok) await readError(res, 'Could not save');
      return adminPersonaSchema.parse(await res.json());
    },
  });
}

/**
 * Last-gasp flush for a closing tab.
 *
 * `sendBeacon` is POST-only and cannot set headers, which is why the draft
 * route accepts POST and takes its content type from the Blob. It is
 * fire-and-forget: no status, no response, no retry. That is acceptable only
 * because it backs up the debounced `fetch` path rather than replacing it.
 *
 * Returns whether the browser accepted the payload for queueing — not whether
 * the server stored it, which is unknowable here.
 */
export function sendPersonaDraftBeacon(
  personaId: number,
  draft: PersonaContentInput,
): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(draft)], {
    type: 'application/json',
  });
  return navigator.sendBeacon(`/api/admin/personas/${personaId}/draft`, blob);
}

export function useDiscardPersonaDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personaId: number) => {
      const res = await fetch(`/api/admin/personas/${personaId}/draft`, {
        method: 'DELETE',
      });
      if (!res.ok) await readError(res, 'Could not discard changes');
      return adminPersonaSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.personas() });
    },
  });
}

/** Promote the draft to published content — the only path into live prompts. */
export function usePublishPersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personaId: number) => {
      const res = await fetch(`/api/admin/personas/${personaId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) await readError(res, 'Could not publish');
      return adminPersonaSchema.parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.personas() });
    },
  });
}

/**
 * Set or clear the org's fallback persona.
 *
 * Optimistic for the same reason as the course selection: the star's filled
 * state comes from this list, so without it the icon only changes after a
 * round trip plus a refetch. Exactly one persona can hold the flag, so the
 * predicted state clears it from every other row too — mirroring what the
 * server's transaction does.
 */
export function useSetOrgDefaultPersona() {
  const queryClient = useQueryClient();
  const key = dataKeys.personas();

  return useMutation({
    mutationFn: async (vars: { personaId: number; makeDefault: boolean }) => {
      // The id is in the path either way: setting names the new default,
      // clearing identifies the org via the persona being un-defaulted.
      const res = await fetch(`/api/admin/personas/${vars.personaId}/default`, {
        method: vars.makeDefault ? 'PUT' : 'DELETE',
      });
      if (!res.ok) await readError(res, 'Could not set the org default');
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AdminPersona[]>(key);
      queryClient.setQueryData<AdminPersona[]>(key, (old) =>
        old?.map((persona) => ({
          ...persona,
          isOrgDefault:
            persona.id === vars.personaId ? vars.makeDefault : false,
        })),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
