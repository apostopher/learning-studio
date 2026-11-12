import { atom } from 'jotai';

/**
 * The material tab the pilot last selected, and on which lesson. Null until
 * they pick one; a selection only applies to its own lesson (see
 * `resolveActiveTab`).
 */
export const activeTabAtom = atom<{ lessonSlug: string; tab: string } | null>(
  null,
);
