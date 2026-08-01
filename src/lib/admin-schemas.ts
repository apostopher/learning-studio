import { z } from 'zod';
import { PROVIDER_IDS } from '#/lib/video-providers';
import { PLAYBACK_FAILURE_CODES } from '#/lib/video-providers/errors';
import { CourseLessonDependencySchema, SubscriptionsSchema } from '#/types';

export const ADMIN_ROLE = 'admin';

/** Course summary as delivered by GET /api/admin/courses (dates arrive as ISO strings). */
export const adminCourseSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  updatedAt: z.coerce.date(),
  moduleCount: z.number(),
  lessonCount: z.number(),
});
export type AdminCourseSummary = z.infer<typeof adminCourseSummarySchema>;

/** A full course row as delivered over JSON (dates coerced back to Date). */
export const courseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Course = z.infer<typeof courseSchema>;

/** Input accepted by POST /api/admin/courses. */
export const createCourseInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
  // Set programmatically by the image upload flow (never user-typed, never
  // '' — the field is undefined until an upload resolves), so a plain optional
  // URL keeps the react-hook-form value type clean (string | undefined).
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

/** Input accepted by PATCH /api/admin/courses/:id — same shape as create. */
export const updateCourseInputSchema = createCourseInputSchema;
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;

export const createModuleInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  // Set programmatically by the image upload flow (never user-typed).
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
});
export type CreateModuleInput = z.infer<typeof createModuleInputSchema>;

/** PATCH body for renaming / updating a module's details (name + cover image). */
export const updateModuleInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
});
export type UpdateModuleInput = z.infer<typeof updateModuleInputSchema>;

export const createLessonInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
});
export type CreateLessonInput = z.infer<typeof createLessonInputSchema>;

export const renameLessonInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
});
export type RenameLessonInput = z.infer<typeof renameLessonInputSchema>;

// Canonical id list lives in PROVIDER_IDS (src/lib/video-providers); derive
// the schema from it so adding a provider can't drift between the two.
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const boardLessonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  rank: z.coerce.number(),
  isAvailable: z.boolean(),
  hasDebrief: z.boolean(),
  /** Whether the learner must watch the video before the lesson completes. */
  needsVideoWatch: z.boolean(),
  requiredSubscriptions: SubscriptionsSchema,
  /** A lesson counts as configured once it has a video. */
  isConfigured: z.boolean(),
  /**
   * How many questions the authored quiz holds. Needed so the Debrief toggle
   * can say what turning it on actually costs — `has_debrief` suppresses the
   * Quiz tab outright, and "this may hide something" without a number is
   * barely better than saying nothing.
   */
  quizQuestionCount: z.number(),
  /**
   * Explicit prerequisites for this lesson. A non-empty array takes this
   * lesson OFF its module's derived chain entirely — see
   * `effectivePrerequisites`.
   */
  dependsOn: z.array(CourseLessonDependencySchema),
  videoProvider: providerIdSchema.nullable(),
  videoRef: z.string().nullable(),
});
export type BoardLesson = z.infer<typeof boardLessonSchema>;

export const boardModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  rank: z.coerce.number(),
  requiredSubscriptions: SubscriptionsSchema,
  /**
   * Slugs of modules that must be finished before this one opens. Unscoped
   * text in the database, so it can hold slugs of deleted or other-course
   * modules; gating and the picker both ignore anything that matches no
   * module in this course.
   */
  dependsOn: z.array(z.string()),
  /**
   * Whether this module's lessons must be taken in rank order. Expanded into
   * prerequisites at gate time rather than stored per lesson — see
   * `modules.sequential_lessons`.
   */
  sequentialLessons: z.boolean(),
  /**
   * Distinct learners with watch progress in this module. Shown beside the
   * dependency picker so adding a prerequisite that locks people out mid-course
   * is a visible decision rather than an accident.
   */
  learnerCount: z.number(),
  lessons: z.array(boardLessonSchema),
});
export type BoardModule = z.infer<typeof boardModuleSchema>;

/** The course header delivered with the editor board. */
export const boardCourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
});
export type BoardCourse = z.infer<typeof boardCourseSchema>;

export const courseBoardSchema = z.object({
  course: boardCourseSchema,
  modules: z.array(boardModuleSchema),
});
export type CourseBoard = z.infer<typeof courseBoardSchema>;

export const reorderModuleInputSchema = z
  .object({
    prevModuleId: z.number().int().positive().nullable(),
    nextModuleId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.prevModuleId !== null || v.nextModuleId !== null, {
    message: 'At least one neighbor is required',
  });
export type ReorderModuleInput = z.infer<typeof reorderModuleInputSchema>;

/**
 * Replace a module's prerequisites wholesale. The full array is sent every
 * time rather than an add/remove delta, so a request that arrives out of order
 * cannot merge two states into one that the admin never chose.
 *
 * Slugs are validated for shape only — that they name real, same-course,
 * non-cyclic modules is checked server-side against live rows, since a client
 * holding a stale board cannot decide it.
 */
export const updateModuleDependenciesInputSchema = z.object({
  dependsOn: z.array(z.string().min(1)).max(100),
});
export type UpdateModuleDependenciesInput = z.infer<
  typeof updateModuleDependenciesInputSchema
>;

/** Turn a module's derived lesson chain on or off. */
export const updateModuleSequentialInputSchema = z
  .object({ sequentialLessons: z.boolean() })
  .strict();
export type UpdateModuleSequentialInput = z.infer<
  typeof updateModuleSequentialInputSchema
>;

/**
 * Replace a lesson's explicit prerequisites. Slugs only — `moduleSlug` is not
 * accepted or stored, because lesson slugs are globally unique and a stored
 * module goes stale the moment the lesson moves.
 */
export const updateLessonDependenciesInputSchema = z
  .object({ dependsOn: z.array(z.string().min(1)).max(100) })
  .strict();
export type UpdateLessonDependenciesInput = z.infer<
  typeof updateLessonDependenciesInputSchema
>;

/**
 * Move a lesson to `targetModuleId` (possibly the same module) between the given
 * neighbors. Both neighbors are null when the lesson lands in an empty module.
 */
export const moveLessonInputSchema = z.object({
  targetModuleId: z.number().int().positive(),
  prevLessonId: z.number().int().positive().nullable(),
  nextLessonId: z.number().int().positive().nullable(),
});
export type MoveLessonInput = z.infer<typeof moveLessonInputSchema>;

/** PATCH body for the lesson Config tab. Every field optional; at least one required. */
export const updateLessonConfigInputSchema = z
  .object({
    isAvailable: z.boolean().optional(),
    hasDebrief: z.boolean().optional(),
    needsVideoWatch: z.boolean().optional(),
    requiredSubscriptions: SubscriptionsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateLessonConfigInput = z.infer<
  typeof updateLessonConfigInputSchema
>;

export const muxCredentialInputSchema = z.object({
  provider: z.literal('mux'),
  keyId: z.string().trim().min(1),
  privateKey: z.string().trim().min(1),
});
export const synthesiaCredentialInputSchema = z.object({
  provider: z.literal('synthesia'),
  apiKey: z.string().trim().min(1),
});
export const saveCredentialInputSchema = z.discriminatedUnion('provider', [
  muxCredentialInputSchema,
  synthesiaCredentialInputSchema,
]);
export type SaveCredentialInput = z.infer<typeof saveCredentialInputSchema>;

/** Client-safe summary — never includes secrets. */
export const credentialSummarySchema = z.object({
  provider: providerIdSchema,
  configured: z.literal(true),
  display: z.record(z.string(), z.unknown()),
  lastValidatedAt: z.coerce.date().nullable(),
});
export type CredentialSummary = z.infer<typeof credentialSummarySchema>;

export const setLessonVideoInputSchema = z.object({
  provider: providerIdSchema,
  ref: z.string().trim().min(1),
});
export type SetLessonVideoInput = z.infer<typeof setLessonVideoInputSchema>;

/** A resolved, playable video. Mirrors `Playback` in `#/lib/video-providers/resolve.server`. */
export const lessonPlaybackReadySchema = z.object({
  status: z.literal('ready'),
  url: z.string().url(),
  kind: z.enum(['hls', 'file']),
  /** Seconds the URL stays valid from when it was resolved — a TTL, not a timestamp. */
  expiresInSeconds: z.number().nonnegative().nullable(),
  poster: z.string().nullable(),
  captions: z.object({ vtt: z.string() }).nullable(),
});

/** A video the provider holds but cannot serve yet. Mirrors `PlaybackPending`. */
export const lessonPlaybackPendingSchema = z.object({
  status: z.enum(['rendering', 'failed']),
});

/**
 * Discriminated on `status` so an unrecognized value fails loudly (parse
 * error) instead of silently matching whichever branch happens to accept a
 * partial shape — a plain `z.union` would do the latter.
 */
export const lessonPlaybackSchema = z.discriminatedUnion('status', [
  lessonPlaybackReadySchema,
  lessonPlaybackPendingSchema,
]);
export type LessonPlayback = z.infer<typeof lessonPlaybackSchema>;

/** Body of a 502 from the video-playback route — `code` is what the UI branches on. */
export const playbackErrorSchema = z.object({
  error: z.string(),
  code: z.enum(PLAYBACK_FAILURE_CODES),
});
