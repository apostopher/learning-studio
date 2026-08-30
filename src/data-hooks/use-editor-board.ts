import { useQuery } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its hook test.
import { type OrgEditorBoard, orgEditorBoardSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/**
 * One board per course in the active org — the editor's horizontal course
 * rail. Takes no arguments: the route it calls is scoped to the active org
 * server-side and accepts no course filter (see the route's doc comment).
 */
export function useEditorBoard() {
  return useQuery<OrgEditorBoard>({
    queryKey: dataKeys.editorBoard(),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch('/api/admin/editor');
      if (!res.ok)
        throw new Error(`Failed to load editor board (${res.status})`);
      return orgEditorBoardSchema.parse(await res.json());
    },
  });
}
