import { z } from 'zod';

/** Which training set a `docs` row belongs to. Stored value, not the label. */
export const DocSourceSchema = z.enum(['itps', '3d-airmanship']);
export type DocSource = z.infer<typeof DocSourceSchema>;

export const DOC_SOURCE_LABELS: Record<DocSource, string> = {
  itps: 'ITPS',
  '3d-airmanship': '3D Airmanship',
};

/** Lesson-chunk inserts and legacy rows take this. */
export const DEFAULT_DOC_SOURCE: DocSource = '3d-airmanship';
