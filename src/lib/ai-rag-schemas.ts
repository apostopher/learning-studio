import { z } from 'zod';

const courseId = z.number().int().positive().optional();

const textMode = z.object({
  mode: z.literal('text'),
  courseId,
  sourcePath: z.string().min(1),
  html: z.string().min(1),
});

const fileMode = z.object({
  mode: z.literal('file'),
  courseId,
  url: z.string().url(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

export const aiRagPostSchema = z.discriminatedUnion('mode', [textMode, fileMode]);
export type AiRagPostInput = z.infer<typeof aiRagPostSchema>;

export const aiRagDeleteSchema = z.object({
  courseId,
  sourcePath: z.string().min(1),
});
export type AiRagDeleteInput = z.infer<typeof aiRagDeleteSchema>;

/**
 * Parse the `?courseId=` query param.
 * - `null`  → omitted → org-wide (course_id IS NULL)
 * - number  → a valid positive id
 * - `undefined` → present but invalid (caller should 400)
 */
export function parseCourseIdParam(
  raw: string | null,
): number | null | undefined {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
