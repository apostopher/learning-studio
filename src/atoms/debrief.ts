import { atom } from 'jotai';
import type { AITest } from '#/ai/schemas';

/**
 * The lesson slug of the debrief attempt submitted in this page session, set
 * once save-results succeeds. It is what lets the Debrief panel show that
 * attempt's score report straight after a below-par submission (call 2),
 * while any later visit during the wait shows only the reopen time.
 */
export const justSubmittedDebriefAtom = atom<string | null>(null);

/**
 * The debrief session already sent to save-results. An atom rather than a
 * ref: the Debrief panel unmounts with its tab, and a remounted container
 * holding a complete session would otherwise post the same attempt again.
 */
export const savedDebriefTestAtom = atom<AITest | null>(null);
