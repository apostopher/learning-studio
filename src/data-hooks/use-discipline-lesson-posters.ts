import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

const lessonPostersSchema = z.record(z.string(), z.string());

/**
 * Poster frames for one discipline's shelf, keyed by lesson id — the
 * library-pane twin of `useLessonPosters`, and the same trade-offs: 30
 * minutes can outlive a short-lived Synthesia URL (the tile falls back to
 * its placeholder and self-heals on the next refetch), and a 403 is a
 * permanent answer for someone without content:read on that discipline, so
 * it is not retried. Every card on a shelf reads this one entry; TanStack
 * dedupes them to a single request per discipline.
 *
 * `disciplineId` is `UNTITLED_DISCIPLINE_ID` for the org-level bag.
 */
export function useDisciplineLessonPosters(disciplineId: number) {
  return useQuery({
    queryKey: dataKeys.disciplineLessonPosters(disciplineId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/disciplines/${disciplineId}/lesson-posters`,
      );
      if (!res.ok) throw new Error(`Failed to load posters (${res.status})`);
      return lessonPostersSchema.parse(await res.json());
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
}
