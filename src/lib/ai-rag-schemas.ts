import { z } from 'zod';

const courseId = z.number().int().positive().optional();

// `lesson:<slug>` is the sourcePath of per-lesson chunks (generateLessonEmbeddings).
// A document must never take one, or it could overwrite or delete a lesson's rows.
const documentSourcePath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith('lesson:'),
    'sourcePath must not start with "lesson:" (reserved for lesson material)',
  );

const textMode = z.object({
  mode: z.literal('text'),
  courseId,
  sourcePath: documentSourcePath,
  html: z.string().min(1),
});

const fileMode = z.object({
  mode: z.literal('file'),
  courseId,
  url: z
    .string()
    .url()
    .refine((url) => {
      try {
        return new URL(url).hostname.endsWith('.vercel-storage.com');
      } catch {
        return false;
      }
    }, 'File url must be hosted on Vercel Blob (*.vercel-storage.com)'),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

export const aiRagPostSchema = z.discriminatedUnion('mode', [
  textMode,
  fileMode,
]);
export type AiRagPostInput = z.infer<typeof aiRagPostSchema>;

export const aiRagDeleteSchema = z.object({
  courseId,
  sourcePath: documentSourcePath,
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
