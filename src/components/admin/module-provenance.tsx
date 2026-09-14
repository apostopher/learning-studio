import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * Provenance for one module on an editor board: who owns it, and the link
 * back to their board, or `undefined` when the viewing course owns it.
 *
 * Shared by `EditorModuleContainer` (this task) and the per-course board
 * (Task 11) — a module borrowed through a remix reads the same way in both
 * places, so the owner-vs-viewer comparison and the link's exact wording and
 * accessible name live in ONE place rather than being re-typed at each call
 * site and drifting apart.
 */
export function moduleProvenance(
  mod: { owner: { id: number; name: string } },
  courseId: number,
): { ownerName: string; editLinkSlot: ReactNode } | undefined {
  if (mod.owner.id === courseId) {
    return undefined;
  }
  return {
    ownerName: mod.owner.name,
    editLinkSlot: (
      <Link
        to="/admin/$courseId/editor"
        params={{ courseId: String(mod.owner.id) }}
        aria-label={`Edited in ${mod.owner.name} — open its board to change this module`}
        className="text-apple-text text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        Edited in {mod.owner.name}
      </Link>
    ),
  };
}
