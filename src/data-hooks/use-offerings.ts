import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateOfferingInput,
  type Offering,
  offeringListSchema,
  offeringSchema,
  type UpdateOfferingInput,
} from '#/lib/offering-schemas';
import { dataKeys } from './keys';

/** Error carrying the HTTP status, so a refusal reads differently to a fault. */
export class OfferingRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OfferingRequestError';
    this.status = status;
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Non-JSON body (e.g. the plain "Forbidden") — keep the fallback.
  }
  throw new OfferingRequestError(message, res.status);
}

/**
 * The offerings overlapping a date window.
 *
 * The window is part of the query key, so panning the calendar fetches the
 * new weeks and keeps the old ones cached for the way back.
 */
export function useOfferings(from: string, to: string) {
  return useQuery({
    queryKey: dataKeys.offerings(from, to),
    queryFn: async (): Promise<Offering[]> => {
      const res = await fetch(
        `/api/admin/offerings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) await readError(res, 'Could not load the schedule');
      return offeringListSchema.parse(await res.json());
    },
    staleTime: 60_000,
    // A 403 cannot be retried into a success, and each attempt delays the
    // explanation the screen owes the reader.
    retry: (failureCount, error) =>
      error instanceof OfferingRequestError && error.status === 403
        ? false
        : failureCount < 1,
  });
}

/**
 * Schedule a course.
 *
 * Not optimistic, deliberately. The server assigns the id, and the roster
 * comes back with server-built labels — an optimistic bar would have to
 * invent both, then swap itself for the real one a moment later. The dialog
 * that calls this is already a deliberate pause in the gesture, so there is
 * no dragging-fluidity to protect here.
 */
export function useCreateOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOfferingInput): Promise<Offering> => {
      const res = await fetch('/api/admin/offerings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) await readError(res, 'Could not schedule this course');
      return offeringSchema.parse(await res.json());
    },
    // Every window, not just the one on screen: an offering can span weeks
    // that several cached windows each show part of.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dataKeys.allOfferings() }),
  });
}

export function useUpdateOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      offeringId,
      ...input
    }: UpdateOfferingInput & { offeringId: number }): Promise<Offering> => {
      const res = await fetch(`/api/admin/offerings/${offeringId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) await readError(res, 'Could not update this offering');
      return offeringSchema.parse(await res.json());
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dataKeys.allOfferings() }),
  });
}

export function useDeleteOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offeringId: number): Promise<void> => {
      const res = await fetch(`/api/admin/offerings/${offeringId}`, {
        method: 'DELETE',
      });
      if (!res.ok) await readError(res, 'Could not unschedule this offering');
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dataKeys.allOfferings() }),
  });
}
