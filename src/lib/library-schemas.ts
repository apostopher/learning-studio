import { z } from 'zod';

/**
 * Wire schemas for the student library. Separate from `library-gating.ts` so
 * that file stays a pure predicate with no dependencies, matching
 * `lesson-gating.ts` / `admin-schemas.ts`.
 */

export const LibraryLockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open') }),
  z.object({
    kind: z.literal('lesson-locked'),
    lessonName: z.string(),
    lessonSlug: z.string(),
    moduleSlug: z.string(),
  }),
  z.object({
    kind: z.literal('module-locked'),
    moduleName: z.string(),
    moduleSlug: z.string(),
  }),
]);

export const LibraryFileSchema = z.object({
  id: z.number(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  lock: LibraryLockSchema,
});

export const LibraryResponseSchema = z.object({
  /**
   * Whether the gate was bypassed because the caller is an admin. Returned
   * rather than swallowed for the same reason `LessonGateResult.isAdmin` is:
   * a silent bypass makes the feature untestable, and an admin seeing 92
   * unlocked files should be able to tell why.
   */
  adminBypass: z.boolean(),
  files: z.array(LibraryFileSchema),
});

export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;
