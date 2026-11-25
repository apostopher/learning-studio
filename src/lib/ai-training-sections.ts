import { z } from 'zod';

/**
 * The AI Training tab's inner sections, in nav order. The ids are the
 * `?trainingSection=` values, so — like the admin section ids — renaming one
 * breaks a bookmark.
 */
export const AI_TRAINING_SECTIONS = [
  { id: 'documents', label: 'Documents' },
  { id: 'persona', label: 'Persona' },
  { id: 'chat', label: 'Chat' },
  { id: 'sessions', label: 'Sessions' },
] as const;

export type AiTrainingSectionId = (typeof AI_TRAINING_SECTIONS)[number]['id'];

/**
 * HIDDEN FOR NOW (user's call, 2026-11-25): out of the nav, and a link to one
 * opens the default section. The code behind it is kept; to bring Chat back,
 * empty this.
 */
const HIDDEN: readonly AiTrainingSectionId[] = ['chat'];

/** The sections to offer, in nav order. */
export const VISIBLE_AI_TRAINING_SECTIONS = AI_TRAINING_SECTIONS.filter(
  (s) => !HIDDEN.includes(s.id),
);

const VISIBLE_IDS = VISIBLE_AI_TRAINING_SECTIONS.map((s) => s.id) as [
  AiTrainingSectionId,
  ...AiTrainingSectionId[],
];

export const DEFAULT_AI_TRAINING_SECTION: AiTrainingSectionId = 'documents';

/**
 * Reads `?trainingSection=` out of the admin search. Loose for the same reason
 * `adminSearchSchema` is — the rest of the query string belongs to someone
 * else — and `.catch(undefined)` so a junk value, or a hidden section, lands on
 * the default rather than an error boundary.
 */
export const aiTrainingSearchSchema = z.looseObject({
  trainingSection: z.enum(VISIBLE_IDS).optional().catch(undefined),
});
