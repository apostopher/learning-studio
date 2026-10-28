import { atom } from 'jotai';
import type { DebriefSaveRecord } from '#/components/lesson-material/parts/debrief-save';

/**
 * The lesson slug of the debrief attempt submitted while the pilot has been
 * on that lesson, set once save-results succeeds. It is what lets the Debrief
 * panel show that attempt's score report straight after a below-par
 * submission (call 2). Cleared when the pilot leaves the lesson
 * (LessonMaterialWrapper), so any later visit during the wait shows only the
 * reopen time.
 */
export const justSubmittedDebriefAtom = atom<string | null>(null);

/**
 * Where the save of a completed debrief session stands. An atom rather than
 * a ref: the Debrief panel unmounts with its tab, and a remounted container
 * must neither post the same attempt again nor forget that its save failed.
 */
export const debriefSaveAtom = atom<DebriefSaveRecord | null>(null);
