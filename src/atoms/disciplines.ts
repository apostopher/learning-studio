import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';

/**
 * Client state for the `/admin/disciplines` screen.
 *
 * Its own module rather than another section of `atoms/admin.ts`: nothing here
 * is read outside that one screen, and `atoms/admin.ts` is already the shared
 * cell for the course editor.
 */

/** The create form's name field. Cleared once the create succeeds. */
export const newDisciplineNameAtom = atom('');

/**
 * Which discipline's name is being edited inline, or null.
 *
 * One id rather than a per-row boolean family: renaming two rows at once is
 * not a state the screen has a design for, and a single cell makes it
 * unrepresentable instead of merely unlikely.
 */
export const renamingDisciplineIdAtom = atom<number | null>(null);

/** The inline rename field's draft. Seeded from the row when editing starts. */
export const renameDisciplineDraftAtom = atom('');

/** Which discipline's "add a subject expert" picker is open, or null. */
export const addingExpertToDisciplineIdAtom = atom<number | null>(null);

/**
 * The person picker's search term, keyed by discipline.
 *
 * An `atomFamily` for the same reason `courseStaffCandidateQueryAtomFamily` is
 * one: a shared cell carried one scope's half-finished search into the next,
 * so closing the picker on Aerobatics and opening it on Navigation showed
 * Aerobatics' term and Aerobatics' results, ready to be assigned to the wrong
 * discipline.
 */
export const expertCandidateQueryAtomFamily = atomFamily(
  (_disciplineId: number) => atom(''),
);

/**
 * The person picked for a discipline, label included.
 *
 * The label rides along because the candidate list is a server-side search:
 * the options change as the term does, so an id alone would lose its display
 * name the moment the term moved off it.
 */
export const expertSelectionAtomFamily = atomFamily((_disciplineId: number) =>
  atom<{ userId: string; label: string } | null>(null),
);

/** Which discipline's delete confirmation is showing, or null. */
export const pendingDeleteDisciplineIdAtom = atom<number | null>(null);
