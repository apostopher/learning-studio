import { useQuery } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { type OrgLibrary, orgLibrarySchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * The active org's whole knowledge library, grouped by discipline.
 *
 * Named `useOrgLibrary` rather than `useLibrary`: that name is already taken
 * by `#/data-hooks/use-library.ts`, an unrelated course-scoped hook for the
 * learner-facing file library. Reusing the name here would either collide or
 * silently replace that hook's very different (`courseSlug`-keyed) contract.
 */
export function useOrgLibrary() {
  return useQuery<OrgLibrary>({
    queryKey: dataKeys.orgLibrary(),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch('/api/admin/library');
      if (!res.ok) throw new Error(`Failed to load library (${res.status})`);
      return orgLibrarySchema.parse(await res.json());
    },
  });
}
