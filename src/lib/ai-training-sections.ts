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

const AI_TRAINING_SECTION_IDS = AI_TRAINING_SECTIONS.map((s) => s.id) as [
  AiTrainingSectionId,
  ...AiTrainingSectionId[],
];

export const DEFAULT_AI_TRAINING_SECTION: AiTrainingSectionId = 'documents';

/**
 * Reads `?trainingSection=` out of the admin search. Loose for the same reason
 * `adminSearchSchema` is — the rest of the query string belongs to someone
 * else — and `.catch(undefined)` so a junk value lands on the default rather
 * than an error boundary.
 */
export const aiTrainingSearchSchema = z.looseObject({
  trainingSection: z.enum(AI_TRAINING_SECTION_IDS).optional().catch(undefined),
});
