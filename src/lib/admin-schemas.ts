import { z } from 'zod';
import { PROVIDER_IDS } from '#/lib/video-providers';
import { PLAYBACK_FAILURE_CODES } from '#/lib/video-providers/errors';
import {
  CourseLessonDependencySchema,
  SubscriptionsSchema,
  UserLevelSchema,
  UserLevelsSchema,
} from '#/types';

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
  levels: UserLevelsSchema,
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
    levels: UserLevelsSchema.optional(),
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

/**
 * Hostnames a news source URL may not point at.
 *
 * The scraper will fetch this URL server-side, months from now, with no code
 * review sitting between the admin's write and that request. Rejecting
 * loopback / private / link-local targets at write time keeps a stored SSRF
 * payload from waiting in the table for a fetcher that does not exist yet.
 * The scraper should still defend itself when it lands; this is the cheap half.
 */
const isBlockedNewsHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  // IPv4 literals only — a DNS name that resolves to a private address is not
  // catchable here, and belongs to the fetcher's own guard.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
};

export const newsSourceUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid URL' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        message: 'URL must start with http or https',
      });
      return;
    }
    if (isBlockedNewsHost(parsed.hostname)) {
      ctx.addIssue({
        code: 'custom',
        message: 'That address is not reachable from the server',
      });
    }
  });

/** A news source row as delivered over JSON, scoped to one course. */
export const newsSourceSchema = z.object({
  id: z.number(),
  courseId: z.number(),
  name: z.string(),
  url: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  /**
   * A ready-made logo (usually SVG), used only when no AVIF/WebP pair exists.
   * Set by the migration from `airmanship-web`, never by the admin form — an
   * uploaded logo takes precedence rather than replacing this.
   */
  imageUrl: z.string().nullable(),
  tintColor: z.string().nullable(),
  active: z.boolean(),
  rank: z.coerce.number(),
});
export type NewsSource = z.infer<typeof newsSourceSchema>;

/** Hex color, 3 or 6 digits. Free-form beyond that — see the ledger's risks. */
const tintColorSchema = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z
    .string()
    .trim()
    .regex(
      /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
      'Use a hex color like #1B4D3E',
    )
    .optional(),
);

/** POST body for creating a news source inside a course. */
export const createNewsSourceInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  url: newsSourceUrlSchema,
  // Set programmatically by the image upload flow (never user-typed).
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
  tintColor: tintColorSchema,
});
export type CreateNewsSourceInput = z.infer<typeof createNewsSourceInputSchema>;

/** PATCH body for a news source. Same fields as create, plus the active flag. */
export const updateNewsSourceInputSchema = createNewsSourceInputSchema.extend({
  active: z.boolean().optional(),
});
export type UpdateNewsSourceInput = z.infer<typeof updateNewsSourceInputSchema>;

/**
 * Move a source between two neighbours in its course's ordering. Both null is
 * rejected: the target position would be undefined.
 */
export const reorderNewsSourceInputSchema = z
  .object({
    prevSourceId: z.number().int().positive().nullable(),
    nextSourceId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.prevSourceId !== null || v.nextSourceId !== null, {
    message: 'At least one neighbor is required',
  });
export type ReorderNewsSourceInput = z.infer<
  typeof reorderNewsSourceInputSchema
>;

/** Body of a 502 from the video-playback route — `code` is what the UI branches on. */
export const playbackErrorSchema = z.object({
  error: z.string(),
  code: z.enum(PLAYBACK_FAILURE_CODES),
});

/**
 * Persona content as the editor posts it. Mirrors `PersonaSchema` but with
 * every field explicitly optional: the editor autosaves whatever has been
 * typed so far, and a blank field is meaningful — it means "fall back to the
 * prompt's built-in default for this field".
 */
export const personaContentInputSchema = z.object({
  basicInfo: z.string().max(20_000).default(''),
  mission: z.string().max(20_000).default(''),
  goal: z.string().max(20_000).default(''),
  communicationStyle: z.string().max(20_000).default(''),
  quotes: z.array(z.string().max(2_000)).max(500).default([]),
  coreDirective: z.string().max(20_000).default(''),
  howToAnswer: z.string().max(20_000).default(''),
});
export type PersonaContentInput = z.infer<typeof personaContentInputSchema>;

/** POST body for creating a persona. Only the label is required. */
export const createPersonaInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});
export type CreatePersonaInput = z.infer<typeof createPersonaInputSchema>;

/** PATCH body for a persona — rename only; content goes through the draft. */
export const renamePersonaInputSchema = createPersonaInputSchema;

/** PUT body for the org default, and for a course's persona selection. */
export const personaSelectionInputSchema = z.object({
  personaId: z.number().int().positive().nullable(),
});
export type PersonaSelectionInput = z.infer<typeof personaSelectionInputSchema>;

/** A persona as GET /api/admin/personas delivers it (dates as ISO strings). */
export const adminPersonaSchema = z.object({
  id: z.number(),
  name: z.string(),
  content: personaContentInputSchema,
  /** `null` means no unpublished changes — the Draft badge's only source. */
  draftContent: personaContentInputSchema.nullable(),
  /** False until published once; gates assignment to a course or org default. */
  isPublished: z.boolean(),
  isOrgDefault: z.boolean(),
  /** Names of courses in this org currently pinned to this persona. */
  usedByCourses: z.array(z.string()),
  updatedAt: z.string(),
});
export type AdminPersona = z.infer<typeof adminPersonaSchema>;

/** GET /api/admin/courses/:id/persona. */
export const coursePersonaSelectionSchema = z.object({
  linked: z.boolean(),
  personaId: z.number().nullable(),
});
export type CoursePersonaSelection = z.infer<
  typeof coursePersonaSelectionSchema
>;

/** Superuser. Bypasses every permission check; only an owner may grant roles. */
export const OWNER_ROLE = 'owner';

export const SUBJECT_EXPERT_ROLE = 'subject-expert';
export const COURSE_MANAGER_ROLE = 'course-manager';

/**
 * Roles that mean something only in the context of one course.
 *
 * The stored name is `subject-expert`, not `SME`: `src/ai/prompts/viper7.ts`
 * special-cases the literal string "SME" in a clause written before any such
 * role existed, and a role name should not silently change what an AI is told.
 * The acronym people actually use lives in ROLE_LABELS.
 */
export const COURSE_SCOPED_ROLES = [
  SUBJECT_EXPERT_ROLE,
  COURSE_MANAGER_ROLE,
] as const;
export type CourseScopedRole = (typeof COURSE_SCOPED_ROLES)[number];

/** Every role that makes someone staff rather than purely a learner. */
export const STAFF_ROLES = [
  OWNER_ROLE,
  ADMIN_ROLE,
  SUBJECT_EXPERT_ROLE,
  COURSE_MANAGER_ROLE,
] as const;

export function isCourseScopedRole(name: string): name is CourseScopedRole {
  return (COURSE_SCOPED_ROLES as readonly string[]).includes(name);
}

/** PUT/DELETE body for assigning or removing course staff. */
export const setCourseStaffInputSchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(COURSE_SCOPED_ROLES),
  })
  .strict();
export type SetCourseStaffInput = z.infer<typeof setCourseStaffInputSchema>;

/**
 * Roles that satisfy the existing admin gates.
 *
 * `owner` is a superuser, so it must pass everything `admin` passes — widening
 * the check in one place keeps the 34 content routes untouched and avoids
 * giving owners a duplicate `admin` row, where revoking one would silently
 * strip access from someone still reading as owner.
 */
export function hasAdminAccess(roles: string[]): boolean {
  return roles.includes(ADMIN_ROLE) || roles.includes(OWNER_ROLE);
}

/**
 * Entities that permissions are expressed over. `enrolment` is separate from
 * `user` on purpose: assigning a course is the day-to-day delegated task,
 * while editing profiles is not, and they should be grantable independently.
 *
 * `level` is separate from `enrolment` on purpose: enrolling grants access to a
 * course, while setting a level changes which lessons inside it a pilot can
 * see — and, because the automatic path only writes upward, it is the only
 * correction mechanism in the system. Folding it into an existing entity would
 * grant that power silently to everyone who already holds it.
 *
 * `course` is org-level: creating and deleting courses is a university act, and
 * a course-scoped role cannot create the course it would be scoped to.
 *
 * `structure`, `content` and `staff` are per-course — checked against
 * `course_staff`, not against a global role. They are separate entities because
 * a course manager prepares the scaffolding (modules, lessons, ordering, level
 * tags) while a subject expert owns the substance (material, video, quiz,
 * debrief). Folding them together would give an assistant authority over the
 * syllabus.
 */
export const PERMISSION_ENTITIES = [
  'user',
  'enrolment',
  'level',
  'course',
  'structure',
  'content',
  'staff',
] as const;
export type PermissionEntity = (typeof PERMISSION_ENTITIES)[number];

export const PERMISSION_ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/**
 * Only the combinations that have an endpoint behind them.
 *
 * `user:delete` is deferred (account deletion is the most destructive thing in
 * the app and shouldn't ship alongside the system that guards it), and
 * `enrolment:update` is meaningless — a subscription row has nothing to edit.
 * A checkbox that enforces nothing is a dead field at the permission layer.
 */
export const GRANTABLE_PERMISSIONS: Record<
  PermissionEntity,
  readonly PermissionAction[]
> = {
  user: ['read', 'create', 'update'],
  enrolment: ['read', 'create', 'delete'],
  level: ['read', 'update'],
  course: ['read', 'create', 'update', 'delete'],
  structure: ['read', 'create', 'update', 'delete'],
  content: ['read', 'create', 'update', 'delete'],
  staff: ['read', 'create', 'delete'],
};

/** Entities resolved against `course_staff` rather than a global role. */
export const COURSE_SCOPED_ENTITIES = [
  'structure',
  'content',
  'staff',
] as const;
export type CourseScopedEntity = (typeof COURSE_SCOPED_ENTITIES)[number];

export function isCourseScopedEntity(
  entity: PermissionEntity,
): entity is CourseScopedEntity {
  return (COURSE_SCOPED_ENTITIES as readonly string[]).includes(entity);
}

export const permissionSchema = z.object({
  entity: z.enum(PERMISSION_ENTITIES),
  action: z.enum(PERMISSION_ACTIONS),
});
export type Permission = z.infer<typeof permissionSchema>;

/** Wire format: "entity:action", e.g. "enrolment:create". */
export function permissionKey(entity: string, action: string): string {
  return `${entity}:${action}`;
}

/**
 * Profile fields an admin may edit.
 *
 * Everything on the profile except `email` — a separate column from the auth
 * record that governs sign-in, so editing it only creates drift — and
 * `associateNumber`, which comes from a counter rather than free text.
 * `pilotLicenses` is omitted for now: it is a nested array whose editor is a
 * feature of its own, and no admin surface asks for it yet.
 */
export const updateUserProfileInputSchema = z.object({
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  callSign: z.string().trim().max(100).nullable().optional(),
  phoneNumber: z.string().trim().max(100).nullable().optional(),
  age: z.number().int().min(0).max(150).nullable().optional(),
  gender: z.enum(['M', 'F']).nullable().optional(),
  uasLicenseCountry: z.string().trim().length(3).nullable().optional(),
  uasWeightClass: z.string().trim().max(50).nullable().optional(),
});
export type UpdateUserProfileInput = z.infer<
  typeof updateUserProfileInputSchema
>;

/**
 * `message` is required and non-empty because it is shown to the pilot. `note`
 * is admin-only. Two fields so neither audience reads a sentence written for
 * the other.
 */
export const setUserLevelInputSchema = z
  .object({
    courseId: z.number().int().positive(),
    level: UserLevelSchema,
    message: z.string().trim().min(1, 'A message for the pilot is required'),
    note: z.string().trim().optional(),
  })
  .strict();
export type SetUserLevelInput = z.infer<typeof setUserLevelInputSchema>;

/** POST body for pre-assigning a course to an email with no account yet. */
export const addPendingEnrolmentInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  courseIds: z.array(z.number().int().positive()).min(1, 'Pick a course'),
});
export type AddPendingEnrolmentInput = z.infer<
  typeof addPendingEnrolmentInputSchema
>;

/** PUT body for granting/revoking a course on an existing account. */
export const setEnrolmentInputSchema = z.object({
  courseId: z.number().int().positive(),
  granted: z.boolean(),
});

/** PUT body for granting/revoking a role. Owner-only at the route layer. */
export const setUserRoleInputSchema = z.object({
  role: z.string().trim().min(1),
  granted: z.boolean(),
});

/** PUT body for the role permission grid. Owner-only. */
export const setRolePermissionInputSchema = z.object({
  role: z.string().trim().min(1),
  entity: z.enum(PERMISSION_ENTITIES),
  action: z.enum(PERMISSION_ACTIONS),
  granted: z.boolean(),
});

/** A user row as GET /api/admin/users delivers it. */
export const adminUserSchema = z.object({
  profileId: z.number(),
  userId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  callSign: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  roles: z.array(z.string()),
  courses: z.array(z.object({ id: z.number(), name: z.string() })),
  /** Current level per course id. Absent for a course with no rows. */
  levels: z.record(z.coerce.number(), UserLevelSchema),
  createdAt: z.string(),
});
export type AdminUserRow = z.infer<typeof adminUserSchema>;

/** Someone pre-assigned courses who has never signed in. */
export const pendingPersonSchema = z.object({
  email: z.string(),
  addedAt: z.string(),
  courses: z.array(z.object({ id: z.number(), name: z.string() })),
});
export type PendingPersonRow = z.infer<typeof pendingPersonSchema>;

export const adminUsersResponseSchema = z.object({
  users: z.array(adminUserSchema),
  pending: z.array(pendingPersonSchema),
});

/**
 * Client-side permission check. `'*'` is the owner's wildcard.
 *
 * Mirrors the server's `hasPermission`, but takes the serialised array that
 * router context carries rather than a Set.
 */
export function hasPermissionKey(
  permissions: string[],
  entity: PermissionEntity,
  action: PermissionAction,
): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes(permissionKey(entity, action))
  );
}
