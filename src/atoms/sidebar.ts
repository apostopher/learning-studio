import { atom } from 'jotai';

export const openModuleSlugAtom = atom<string | null>(null);

/**
 * Whether the sidebar's "Completed at earlier levels" disclosure is open.
 * Defaults closed — the archive is secondary and must not compete with
 * current-level material on first render. Same pattern as
 * `openModuleSlugAtom` for the module accordion.
 */
export const archiveSectionOpenAtom = atom(false);

/**
 * Whether the student sidebar's 3D Airmanship group is open. Closed by
 * default, like the modules inside it.
 */
export const flagshipGroupOpenAtom = atom(false);
