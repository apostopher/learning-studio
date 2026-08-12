import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  AddressSchema,
  type CourseLessonDependenciesSchema,
  CourseLessonQuizAnswerSchema,
  CourseLessonQuizAnswersSchema,
  CourseLessonQuizSchema,
  type MaterialLink,
  type NewsScrapeStatus,
  OnboardingAnswersSchema,
  type OnboardingQuestionsSchema,
  type OtherVideoIdsSchema,
  PersonaSchema,
  PilotLicensesSchema,
  ProfileVisibilitySchema,
  SubscriptionsSchema,
} from '@/types';

export * from './auth-schema';

export const coursesTable = pgTable('courses', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrlAvif: text('image_url_avif'),
  imageUrlWebp: text('image_url_webp'),
  onboardingQuestions: jsonb('onboarding_questions')
    .$type<z.infer<typeof OnboardingQuestionsSchema>>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const dbCourseSchema = createSelectSchema(coursesTable);
export type DBCourse = z.infer<typeof dbCourseSchema>;

export const coursesTableRelations = relations(coursesTable, ({ many }) => ({
  courseOrgs: many(courseOrgsTable),
  modules: many(modulesTable),
  subscriptions: many(courseSubscriptionsTable),
  docs: many(docs),
  fileAssignments: many(blobFileAssignmentsTable),
  onboarding: many(courseOnboardingTable),
  newsSources: many(newsSourcesTable),
}));

export const modulesTable = pgTable('modules', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  courseId: integer('course_id')
    .notNull()
    .references(() => coursesTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  imageUrlAvif: text('image_url_avif'),
  imageUrlWebp: text('image_url_webp'),
  requiredSubscriptions: text('required_subscriptions').array().notNull(),
  rank: numeric('rank', { precision: 30, scale: 15 }).notNull(),
  /**
   * Whether this module's lessons must be taken in rank order.
   *
   * Expanded into prerequisites at gate time (`effectivePrerequisites`) rather
   * than written as per-lesson edges: lessons can be both reordered and moved
   * between modules, and stored edges would keep enforcing whatever order was
   * current when they were written. Each lesson chains to the nearest
   * PRECEDING lesson that can actually block, skipping any that cannot — see
   * `lesson-gating.ts` for why skipping is load-bearing rather than cosmetic.
   *
   * Defaults true: sequential is the overwhelmingly common intent, and the
   * alternative ships a feature that does nothing until toggled once per
   * module, with the forgotten module silently unsequenced.
   */
  sequentialLessons: boolean('sequential_lessons').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const dbModuleSchema = createSelectSchema(modulesTable, {
  requiredSubscriptions: SubscriptionsSchema,
});
export type DBModule = z.infer<typeof dbModuleSchema>;

export const modulesTableRelations = relations(
  modulesTable,
  ({ one, many }) => ({
    course: one(coursesTable, {
      fields: [modulesTable.courseId],
      references: [coursesTable.id],
    }),
    lessons: many(lessonsTable),
    fileAssignments: many(blobFileAssignmentsTable),
  }),
);

// GIN index for required_subscriptions
void sql`CREATE INDEX IF NOT EXISTS idx_modules_required_subs ON modules USING GIN (required_subscriptions);`;

export const lessonsTable = pgTable('lessons', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  moduleId: integer('module_id')
    .notNull()
    .references(() => modulesTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  otherVideoIds: jsonb('other_video_ids')
    .$type<z.infer<typeof OtherVideoIdsSchema>>()
    .default([]),
  videoProvider: text('video_provider'), // 'mux' | 'synthesia' | null
  videoRef: text('video_ref'),
  requiredSubscriptions: text('required_subscriptions').array().notNull(),
  rank: numeric('rank', { precision: 30, scale: 15 }).notNull(),
  isAvailable: boolean('is_available').notNull().default(false),
  exclusivePerDay: boolean('exclusive_per_day').notNull().default(false),
  hasDebrief: boolean('has_debrief').notNull().default(true),
  /**
   * PRESERVED FOR PARITY — no learner-side consumer yet.
   *
   * Re-added so the `iTPS UAS Remote` import could carry the old platform's
   * per-lesson setting across losslessly (13 of its 102 lessons had it
   * deliberately false, and the old database is not guaranteed to remain
   * available). Now editable from the lesson Config tab's "Video watch" row.
   *
   * The old app gated lesson completion on it — a lesson did not count as
   * complete until its video had been watched. Whatever reinstates that
   * behaviour is the intended consumer; until then this is admin-config only,
   * exactly like `hasDebrief` above, which has no learner-side reader either.
   */
  needsVideoWatch: boolean('needs_video_watch').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const dbLessonSchema = createSelectSchema(lessonsTable, {
  requiredSubscriptions: SubscriptionsSchema,
});
export type DBLesson = z.infer<typeof dbLessonSchema>;

export const lessonsTableRelations = relations(
  lessonsTable,
  ({ one, many }) => ({
    module: one(modulesTable, {
      fields: [lessonsTable.moduleId],
      references: [modulesTable.id],
    }),
    quizAnswers: many(lessonQuizAnswersTable),
    material: many(lessonMaterialTable),
    fileAssignments: many(blobFileAssignmentsTable),
    favKeyPoints: many(favKeyPointsTable),
    orgLessons: many(orgLessonsTable),
  }),
);

// GIN index for required_subscriptions
void sql`CREATE INDEX IF NOT EXISTS idx_lessons_required_subs ON lessons USING GIN (required_subscriptions);`;

export const courseVideoProvidersTable = pgTable(
  'course_video_providers',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'mux' | 'synthesia'
    secrets: jsonb('secrets').notNull(), // AES-GCM envelope { v, iv, tag, ct }
    lastValidatedAt: timestamp('last_validated_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('course_video_providers_course_provider_idx').on(
      table.courseId,
      table.provider,
    ),
  ],
);

export const moduleDependenciesTable = pgTable(
  'module_dependencies',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    moduleId: integer('module_id')
      .unique()
      .notNull()
      .references(() => modulesTable.id, { onDelete: 'cascade' }),
    dependsOn: text('depends_on').array().notNull(),
  },
  (table) => [index('module_depends_on_idx').on(table.dependsOn)],
);

export const lessonDependenciesTable = pgTable('lesson_dependencies', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  lessonId: integer('lesson_id')
    .unique()
    .notNull()
    .references(() => lessonsTable.id, { onDelete: 'cascade' }),
  dependsOn: jsonb('depends_on')
    .$type<z.infer<typeof CourseLessonDependenciesSchema>>()
    .notNull(),
});

// GIN index for JSONB depends_on field
void sql`CREATE INDEX IF NOT EXISTS idx_lesson_dependencies_depends_on ON lesson_dependencies USING GIN (depends_on);`;

export const videoProgressTable = pgTable(
  'videos_progress',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessonsTable.id, { onDelete: 'cascade' }),
    progress: integer().notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('videos_progress_user_id_idx').on(table.userId),
    index('videos_progress_user_lesson_idx').on(table.userId, table.lessonId),
    index('videos_progress_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const videoProgressInsertSchema = createInsertSchema(videoProgressTable);
export type VideoProgressInsert = z.infer<typeof videoProgressInsertSchema>;

export const videoProgressSelectSchema = createSelectSchema(videoProgressTable);
export type VideoProgressSelect = z.infer<typeof videoProgressSelectSchema>;

export const videoProgressTableRelations = relations(
  videoProgressTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [videoProgressTable.userId],
      references: [userProfileTable.userId],
    }),
  }),
);

export const lessonQuizAnswersTable = pgTable(
  'lesson_quiz_answers',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    lessonSlug: varchar('lesson_slug', { length: 255 })
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: 'cascade' }),
    answers: json('answers')
      .$type<z.infer<typeof CourseLessonQuizAnswersSchema>>()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('lesson_quiz_answers_user_id_idx').on(table.userId),
    index('lesson_quiz_answers_user_lesson_idx').on(
      table.userId,
      table.lessonSlug,
    ),
  ],
);

export const lessonQuizAnswersInsertSchema = createInsertSchema(
  lessonQuizAnswersTable,
  {
    answers: CourseLessonQuizAnswersSchema,
  },
);
export type LessonQuizAnswersInsert = z.infer<
  typeof lessonQuizAnswersInsertSchema
>;

export const lessonQuizAnswersSelectSchema = createSelectSchema(
  lessonQuizAnswersTable,
  {
    answers: CourseLessonQuizAnswerSchema,
  },
);
export type LessonQuizAnswersSelect = z.infer<
  typeof lessonQuizAnswersSelectSchema
>;

export const lessonQuizAnswersTableRelations = relations(
  lessonQuizAnswersTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [lessonQuizAnswersTable.userId],
      references: [userProfileTable.userId],
    }),
    lesson: one(lessonsTable, {
      fields: [lessonQuizAnswersTable.lessonSlug],
      references: [lessonsTable.slug],
    }),
  }),
);

export const lessonMaterialTable = pgTable(
  'lesson_material',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lessonSlug: text('lesson_slug')
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    keyPoints: json('key_points').$type<string[]>(),
    quiz: json('quiz').$type<z.infer<typeof CourseLessonQuizSchema>>(),
    proTips: text('pro_tips'),
    links: json('links').$type<MaterialLink[]>(),
    assignments: text('assignments'),
    jobOfTheDay: text('job_of_the_day'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('lesson_material_lesson_slug_idx').on(table.lessonSlug)],
);

export const lessonMaterialInsertSchema = createInsertSchema(
  lessonMaterialTable,
  {
    quiz: CourseLessonQuizSchema,
  },
);
export type LessonMaterialInsert = z.infer<typeof lessonMaterialInsertSchema>;

export const lessonMaterialSelectSchema = createSelectSchema(
  lessonMaterialTable,
  {
    quiz: CourseLessonQuizSchema,
  },
);
export type LessonMaterialSelect = z.infer<typeof lessonMaterialSelectSchema>;

export const lessonMaterialTableRelations = relations(
  lessonMaterialTable,
  ({ one }) => ({
    lesson: one(lessonsTable, {
      fields: [lessonMaterialTable.lessonSlug],
      references: [lessonsTable.slug],
    }),
  }),
);

export const lessonMaterialProgressTable = pgTable(
  'lesson_material_progress',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    lessonSlug: varchar('lesson_slug', { length: 255 })
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: 'cascade' }),
    sectionName: text('section_name').notNull(),
    completed: boolean('completed').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('lesson_material_progress_user_lesson_section_idx').on(
      table.userId,
      table.lessonSlug,
      table.sectionName,
    ),
  ],
);

export const lessonMaterialProgressInsertSchema = createInsertSchema(
  lessonMaterialProgressTable,
);
export type LessonMaterialProgressInsert = z.infer<
  typeof lessonMaterialProgressInsertSchema
>;

export const lessonMaterialProgressSelectSchema = createSelectSchema(
  lessonMaterialProgressTable,
);
export type LessonMaterialProgressSelect = z.infer<
  typeof lessonMaterialProgressSelectSchema
>;

export const lessonMaterialProgressTableRelations = relations(
  lessonMaterialProgressTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [lessonMaterialProgressTable.userId],
      references: [userProfileTable.userId],
    }),
    lesson: one(lessonsTable, {
      fields: [lessonMaterialProgressTable.lessonSlug],
      references: [lessonsTable.slug],
    }),
  }),
);

export const favKeyPointsTable = pgTable(
  'fav_key_points',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    lessonSlug: varchar('lesson_slug', { length: 255 }).references(
      () => lessonsTable.slug,
      {
        onDelete: 'cascade',
      },
    ),
    keyPoint: text('key_point').notNull(),
  },
  (table) => [
    uniqueIndex('fav_key_points_user_lesson_key_point_idx').on(
      table.userId,
      table.lessonSlug,
      table.keyPoint,
    ),
  ],
);

export const favKeyPointsInsertSchema = createInsertSchema(favKeyPointsTable);
export type FavKeyPointsInsert = z.infer<typeof favKeyPointsInsertSchema>;

export const favKeyPointsSelectSchema = createSelectSchema(favKeyPointsTable);
export type FavKeyPointsSelect = z.infer<typeof favKeyPointsSelectSchema>;

export const blobFilesTable = pgTable(
  'blob_files',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    url: varchar({ length: 500 }).notNull(),
    size: integer().notNull(),
    type: varchar({ length: 100 }).notNull(),
    uploadedBy: varchar({ length: 255 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('blob_files_uploaded_by_idx').on(table.uploadedBy),
    index('blob_files_created_at_idx').on(table.createdAt),
    index('blob_files_url_idx').on(table.url),
  ],
);

export const blobFilesInsertSchema = createInsertSchema(blobFilesTable);
export type BlobFilesInsert = z.infer<typeof blobFilesInsertSchema>;

export const blobFilesSelectSchema = createSelectSchema(blobFilesTable);
export type BlobFilesSelect = z.infer<typeof blobFilesSelectSchema>;

export const blobFilesTableRelations = relations(
  blobFilesTable,
  ({ many }) => ({
    assignments: many(blobFileAssignmentsTable),
  }),
);

export const blobFileAssignmentsTable = pgTable(
  'blob_file_assignments',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    fileId: integer('file_id')
      .notNull()
      .references(() => blobFilesTable.id, { onDelete: 'cascade' }),
    // Integer FKs (not slugs): immutable, smaller/faster indexes and joins.
    // Each is nullable — a file can be assigned at course, module, or lesson level.
    courseId: integer('course_id').references(() => coursesTable.id, {
      onDelete: 'cascade',
    }),
    moduleId: integer('module_id').references(() => modulesTable.id, {
      onDelete: 'cascade',
    }),
    lessonId: integer('lesson_id').references(() => lessonsTable.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('blob_file_assignments_file_id_idx').on(table.fileId),
    index('blob_file_assignments_course_id_idx').on(table.courseId),
    index('blob_file_assignments_module_id_idx').on(table.moduleId),
    index('blob_file_assignments_lesson_id_idx').on(table.lessonId),
  ],
);

// Add foreign key relationship
export const blobFileAssignmentsRelations = relations(
  blobFileAssignmentsTable,
  ({ one }) => ({
    file: one(blobFilesTable, {
      fields: [blobFileAssignmentsTable.fileId],
      references: [blobFilesTable.id],
    }),
    course: one(coursesTable, {
      fields: [blobFileAssignmentsTable.courseId],
      references: [coursesTable.id],
    }),
    module: one(modulesTable, {
      fields: [blobFileAssignmentsTable.moduleId],
      references: [modulesTable.id],
    }),
    lesson: one(lessonsTable, {
      fields: [blobFileAssignmentsTable.lessonId],
      references: [lessonsTable.id],
    }),
  }),
);

export const blobFileAssignmentsInsertSchema = createInsertSchema(
  blobFileAssignmentsTable,
);
export type BlobFileAssignmentsInsert = z.infer<
  typeof blobFileAssignmentsInsertSchema
>;

export const blobFileAssignmentsSelectSchema = createSelectSchema(
  blobFileAssignmentsTable,
);
export type BlobFileAssignmentsSelect = z.infer<
  typeof blobFileAssignmentsSelectSchema
>;

export const userProfileTable = pgTable(
  'user_profiles',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 }).notNull().unique(),
    associateNumber: varchar('associate_number', { length: 12 }).unique(),
    callSign: varchar('call_sign', { length: 100 }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    email: varchar('email', { length: 100 }).notNull().unique(),
    phoneNumber: varchar('phone_number', { length: 100 }),
    avatarURL: varchar('avatar_url'),
    age: integer('age'),
    gender: varchar('gender', { enum: ['M', 'F'] }),
    pilotLicenses: json('pilot_licenses')
      .$type<z.infer<typeof PilotLicensesSchema>>()
      .array(),
    uasLicenseCountry: varchar('uas_license_country', { length: 3 }), // 3 letter country code
    uasLicenseType: varchar('uas_license_type').array(),
    uasType: varchar('uas_type').array(),
    uasWeightClass: varchar('uas_weight_class'),
    address: json('address').$type<z.infer<typeof AddressSchema>>(),
    visibility:
      json('visibility').$type<z.infer<typeof ProfileVisibilitySchema>>(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('user_profile_user_id_idx').on(table.userId),
    index('user_profile_call_sign_idx').on(table.callSign),
    index('user_profile_first_name_idx').on(table.firstName),
    index('user_profile_last_name_idx').on(table.lastName),
    index('user_profile_created_at_idx').on(table.createdAt),
  ],
);

// GIN index for address JSON field to optimize country searches
void sql`CREATE INDEX IF NOT EXISTS idx_user_profiles_address_gin ON user_profiles USING GIN (address);`;

export const userProfileInsertSchema = createInsertSchema(userProfileTable, {
  address: AddressSchema.optional().nullable(),
  pilotLicenses: PilotLicensesSchema.optional().nullable(),
  visibility: ProfileVisibilitySchema.optional().nullable(),
});
export type UserProfileInsert = z.infer<typeof userProfileInsertSchema>;

export const userProfileSelectSchema = createSelectSchema(userProfileTable, {
  address: AddressSchema.optional().nullable(),
  pilotLicenses: PilotLicensesSchema.optional().nullable(),
  visibility: ProfileVisibilitySchema.optional().nullable(),
});
export type UserProfileSelect = z.infer<typeof userProfileSelectSchema>;

export const userProfileTableRelations = relations(
  userProfileTable,
  ({ many }) => ({
    aiChats: many(aiChats),
    videoProgress: many(videoProgressTable),
    lessonQuizAnswers: many(lessonQuizAnswersTable),
    lessonMaterialProgress: many(lessonMaterialProgressTable),
    courseSubscriptions: many(courseSubscriptionsTable),
    userNewsSources: many(userNewsSourcesTable),
    favKeyPoints: many(favKeyPointsTable),
    userRoles: many(userProfileRolesTable),
    userOrganizations: many(userOrgTable),
    courseOnboarding: many(courseOnboardingTable),
  }),
);

export const userRolesTable = pgTable(
  'user_roles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    // Use enum for integrity; make it unique so each logical role appears once.
    name: varchar('name', { length: 100 }).notNull().unique(),
    description: text('description'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('user_roles_name_idx').on(t.name)],
);

export const userRolesInsertSchema = createInsertSchema(userRolesTable);
export type UserRolesInsert = z.infer<typeof userRolesInsertSchema>;

export const userRolesSelectSchema = createSelectSchema(userRolesTable);
export type UserRolesSelect = z.infer<typeof userRolesSelectSchema>;

export const userRolesTableRelations = relations(
  userRolesTable,
  ({ many }) => ({
    users: many(userProfileRolesTable),
    permissions: many(rolePermissionsTable),
  }),
);

/**
 * What a role may do, as entity × action.
 *
 * Granted to roles rather than to people, so "what can an admin do" has one
 * answer instead of needing every admin inspected. Per-user overrides can be
 * layered later as a second table unioned at check time — additive, so this
 * stays the reversible choice.
 *
 * `owner` is deliberately absent from this table: it bypasses permission
 * checks entirely (see `requirePermission`), so rows for it would be
 * unreadable configuration that changes nothing.
 *
 * Entity and action are plain text rather than Postgres enums so adding an
 * entity doesn't need a migration; the zod schemas at the API edge are what
 * constrain the values.
 */
export const rolePermissionsTable = pgTable(
  'role_permissions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    roleId: integer('role_id')
      .notNull()
      .references(() => userRolesTable.id, { onDelete: 'cascade' }),
    entity: varchar('entity', { length: 50 }).notNull(),
    action: varchar('action', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('role_permissions_role_entity_action_idx').on(
      t.roleId,
      t.entity,
      t.action,
    ),
    index('role_permissions_role_idx').on(t.roleId),
  ],
);

export const rolePermissionsRelations = relations(
  rolePermissionsTable,
  ({ one }) => ({
    role: one(userRolesTable, {
      fields: [rolePermissionsTable.roleId],
      references: [userRolesTable.id],
    }),
  }),
);

/**
 * A course assigned to an email address before that person has ever signed in.
 *
 * `course_subscriptions.user_id` references a real profile row, which cannot
 * exist until first sign-in — so pre-assignment needs its own home. Kept at
 * one row per (email, course), mirroring `course_subscriptions` exactly, which
 * makes the claim a straight copy and makes adding or removing a single course
 * a row insert/delete rather than an array rewrite.
 *
 * `claimedAt` is stamped rather than the row deleted, so the users list can
 * still show who was invited and when.
 */
export const pendingEnrolmentsTable = pgTable(
  'pending_enrolments',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: varchar('email', { length: 100 }).notNull(),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    /** Acting admin/owner's user id — a plain id, see `grantedBy`. */
    addedBy: varchar('added_by', { length: 255 }),
    addedAt: timestamp('added_at', { mode: 'date' }).notNull().defaultNow(),
    /** Null until the person first signs in and the row is applied. */
    claimedAt: timestamp('claimed_at', { mode: 'date' }),
  },
  (t) => [
    uniqueIndex('pending_enrolments_email_course_idx').on(t.email, t.courseId),
    index('pending_enrolments_email_idx').on(t.email),
  ],
);

export const pendingEnrolmentsRelations = relations(
  pendingEnrolmentsTable,
  ({ one }) => ({
    course: one(coursesTable, {
      fields: [pendingEnrolmentsTable.courseId],
      references: [coursesTable.id],
    }),
  }),
);

export const userProfileRolesTable = pgTable(
  'user_profile_roles',
  {
    userProfileId: integer('user_profile_id')
      .notNull()
      .references(() => userProfileTable.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => userRolesTable.id, { onDelete: 'restrict' }),
    assignedBy: varchar('assigned_by', { length: 255 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userProfileId, t.roleId], name: 'upr_pk' }),
    index('upr_user_idx').on(t.userProfileId),
    index('upr_role_idx').on(t.roleId),
  ],
);

export const userProfileRolesRelations = relations(
  userProfileRolesTable,
  ({ one }) => ({
    userProfile: one(userProfileTable, {
      fields: [userProfileRolesTable.userProfileId],
      references: [userProfileTable.id],
    }),
    role: one(userRolesTable, {
      fields: [userProfileRolesTable.roleId],
      references: [userRolesTable.id],
    }),
  }),
);

/**
 * News sources are sandboxed per course: a row belongs to exactly one course,
 * and the same outlet tracked by two courses is two independent rows. There is
 * deliberately no "global" source — `course_id` is NOT NULL, so every row is
 * reachable from exactly one course's admin section and one course's feed.
 */
export const newsSourcesTable = pgTable(
  'news_sources',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /**
     * CSS selectors the scraper narrows a page with before LLM extraction.
     * No admin UI yet — the scraper is not ported into this repo, and a
     * selector cannot be validated without one. Empty means "scrape the whole
     * page", which is the scraper's own fallback, so null degrades safely.
     */
    selectors: text('selectors').array().default([]),
    imageUrlAvif: text('image_url_avif'),
    imageUrlWebp: text('image_url_webp'),
    /**
     * A ready-made logo used as-is, with no format negotiation — in practice
     * an SVG.
     *
     * Exists because a publication's mark is usually vector, and the AVIF/WebP
     * pair above cannot represent one: `optimizeImage` runs raster codecs, and
     * declaring an SVG as `type="image/webp"` makes the browser pick that
     * `<source>` and then fail to decode it. For a wordmark, vector is also
     * simply better — smaller and resolution-independent.
     *
     * Lowest precedence: AVIF, then WebP, then this. An admin uploading a new
     * logo therefore overrides a migrated one without destroying it.
     *
     * Counted by `sweepOrphanBlobs` — a blob under `news-sources/` that no
     * column references is deleted, and this column holds such references.
     */
    imageUrl: text('image_url'),
    tintColor: text('tint_color'),
    active: boolean('active').notNull().default(true),
    /**
     * When the scrape cron last finished with this source, successfully or not.
     * Drives stalest-first ordering, so a run that exhausts its time budget
     * delays a source by a day rather than starving the same tail forever.
     */
    lastScrapedAt: timestamp('last_scraped_at', { mode: 'date' }),
    /**
     * Why the last run produced what it produced. Without this every distinct
     * failure — robots block, 403, dead domain, JS-rendered index — presents
     * identically as an empty feed and the admin can only guess.
     */
    lastScrapeStatus: text('last_scrape_status').$type<NewsScrapeStatus>(),
    lastScrapeMessage: text('last_scrape_message'),
    // Precision matches modules/lessons: reordering splits the midpoint between
    // neighbours, and scale 5 exhausts after ~17 splits between the same pair.
    rank: numeric('rank', { precision: 30, scale: 15 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Scoped, not global: the same feed may legitimately appear in two courses,
    // but twice in one course is always a mistake, and this is the only thing
    // that catches two admins submitting it at once.
    uniqueIndex('news_sources_course_url_idx').on(table.courseId, table.url),
    index('news_sources_course_id_idx').on(table.courseId),
  ],
);

export const newsSourcesInsertSchema = createInsertSchema(newsSourcesTable);
export type NewsSourcesInsert = z.infer<typeof newsSourcesInsertSchema>;

export const newsSourcesSelectSchema = createSelectSchema(newsSourcesTable);
export type NewsSourcesSelect = z.infer<typeof newsSourcesSelectSchema>;

export const newsSourcesTableRelations = relations(
  newsSourcesTable,
  ({ one, many }) => ({
    course: one(coursesTable, {
      fields: [newsSourcesTable.courseId],
      references: [coursesTable.id],
    }),
    userNewsSources: many(userNewsSourcesTable),
    articles: many(newsArticlesTable),
  }),
);

/**
 * Articles harvested by the scrape cron, scoped to the course whose source
 * yielded them.
 *
 * Rows are transient: the cron deletes anything whose `firstSeenAt` is older
 * than a week. That window is also the dedup window — a story re-linked after
 * seven days resurfaces as new, which is accepted.
 */
export const newsArticlesTable = pgTable(
  'news_articles',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    newsSourceId: integer('news_source_id')
      .notNull()
      .references(() => newsSourcesTable.id, { onDelete: 'cascade' }),
    /** Normalized: tracking params stripped, `<link rel="canonical">` honoured. */
    canonicalUrl: text('canonical_url').notNull(),
    /** As extracted, before normalization — kept so a bad canonical is debuggable. */
    originalUrl: text('original_url').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** Publisher's og:image, hotlinked. Null when the page carried none. */
    imageUrl: text('image_url'),
    /** From the page's meta tags. Null when it published none we could parse. */
    publishedAt: timestamp('published_at', { mode: 'date' }),
    /**
     * True when `publishedAt` was filled from `firstSeenAt` because the page
     * carried no usable date. The UI must not render an estimated value as a
     * precise publication time.
     */
    publishedAtEstimated: boolean('published_at_estimated')
      .notNull()
      .default(false),
    /** When the cron first saw this article. Always set; drives retention. */
    firstSeenAt: timestamp('first_seen_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    /** title + description, for near-duplicate detection across sources. */
    embedding: vector('embedding', { dimensions: 3072 }),
    /**
     * Set when this article was judged a duplicate of another in the same
     * course. The row is kept rather than deleted so a wrong merge is
     * diagnosable, and so the UI can later say "also covered by …".
     */
    dedupeOfId: integer('dedupe_of_id'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Makes the run idempotent: a retried or overlapping cron upserts rather
    // than inserting the same article twice.
    uniqueIndex('news_articles_course_url_idx').on(
      table.courseId,
      table.canonicalUrl,
    ),
    index('news_articles_course_published_idx').on(
      table.courseId,
      table.publishedAt.desc(),
    ),
    // The retention sweep's predicate.
    index('news_articles_first_seen_idx').on(table.firstSeenAt),
  ],
);

export const newsArticlesSelectSchema = createSelectSchema(newsArticlesTable);
export type NewsArticlesSelect = z.infer<typeof newsArticlesSelectSchema>;

export const newsArticlesTableRelations = relations(
  newsArticlesTable,
  ({ one }) => ({
    course: one(coursesTable, {
      fields: [newsArticlesTable.courseId],
      references: [coursesTable.id],
    }),
    source: one(newsSourcesTable, {
      fields: [newsArticlesTable.newsSourceId],
      references: [newsSourcesTable.id],
    }),
  }),
);

/**
 * Per-user source preferences, as EXCLUSIONS: a row means this student muted
 * that source. No rows means the full feed.
 *
 * Exclusion, not the inclusion model inherited from `airmanship-web`, because
 * inclusion cannot express "show me nothing" — its rule was "no rows means
 * all", so unticking every source left zero rows and the feed silently
 * reappeared in full. Exclusion has no ambiguous state and needs no
 * "has this user customized?" flag.
 *
 * Keyed `(userId, newsSourceId)` with no `courseId`: `news_sources.course_id`
 * is NOT NULL and a source belongs to exactly one course, so the source id
 * already determines the course. Carrying one here would be denormalization.
 * (This resolves the OPEN item this comment used to carry.)
 */
export const userNewsSourcesTable = pgTable(
  'user_news_sources',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    newsSourceId: integer('news_source_id')
      .notNull()
      .references(() => newsSourcesTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('user_news_sources_user_source_idx').on(
      table.userId,
      table.newsSourceId,
    ),
  ],
);

export const userNewsSourcesInsertSchema =
  createInsertSchema(userNewsSourcesTable);
export type UserNewsSourcesInsert = z.infer<typeof userNewsSourcesInsertSchema>;

export const userNewsSourcesSelectSchema =
  createSelectSchema(userNewsSourcesTable);
export type UserNewsSourcesSelect = z.infer<typeof userNewsSourcesSelectSchema>;

export const userNewsSourcesTableRelations = relations(
  userNewsSourcesTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [userNewsSourcesTable.userId],
      references: [userProfileTable.userId],
    }),
    newsSource: one(newsSourcesTable, {
      fields: [userNewsSourcesTable.newsSourceId],
      references: [newsSourcesTable.id],
    }),
  }),
);

export const helpTopicsTable = pgTable('help_topics', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: text('title').notNull().unique(),
  content: text('content').notNull(),
  rank: numeric('rank', { precision: 10, scale: 5 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const helpTopicsInsertSchema = createInsertSchema(helpTopicsTable);
export type HelpTopicsInsert = z.infer<typeof helpTopicsInsertSchema>;

export const helpTopicsSelectSchema = createSelectSchema(helpTopicsTable);
export type HelpTopicsSelect = z.infer<typeof helpTopicsSelectSchema>;
export const courseSubscriptionsTable = pgTable(
  'course_subscriptions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    /**
     * Who granted this entitlement — an admin/owner's user id, or null when it
     * arrived any other way (seeded, or claimed from a pending row on first
     * sign-in, where `pending_enrolments.addedBy` holds the real actor).
     *
     * A plain id rather than an FK: the audit string should outlive the
     * account that created it.
     */
    grantedBy: varchar('granted_by', { length: 255 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('course_subscriptions_user_course_idx').on(
      table.userId,
      table.courseId,
    ),
  ],
);

/**
 * The lesson a learner was last on in a course, so `/course/:slug` can resume
 * them there instead of showing an empty "pick a lesson" page.
 *
 * A separate table rather than two columns on course_subscriptions, which is
 * the same grain: it keeps learning activity out of the entitlement row, and
 * gives a future "delete my learning history" something it can truncate
 * without touching enrolment.
 *
 * Written only when a lesson renders UNLOCKED content — a lock screen is a
 * door you bounced off, not a place you were. See
 * docs/superpowers/specs/2026-07-30-course-resume-redirect-ledger.md.
 */
export const courseLastViewedTable = pgTable(
  'course_last_viewed',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    /**
     * MUST be `set null`, not the `cascade` used by every other FK in this
     * file. On cascade, an admin deleting a lesson would delete the whole row
     * — and if this ever moves onto course_subscriptions, it would delete the
     * ENROLMENT of every learner last seen on that lesson, silently revoking
     * course access. Null here simply means "no pointer", which
     * resolveResumeTarget already handles as a first visit.
     */
    lessonId: integer('lesson_id').references(() => lessonsTable.id, {
      onDelete: 'set null',
    }),
    viewedAt: timestamp('viewed_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // One pointer per user per course — this is what makes the upsert on
    // every lesson view a conflict-update rather than an unbounded insert.
    uniqueIndex('course_last_viewed_user_course_idx').on(
      table.userId,
      table.courseId,
    ),
  ],
);

export const courseLastViewedSelectSchema = createSelectSchema(
  courseLastViewedTable,
);
export type CourseLastViewedSelect = z.infer<
  typeof courseLastViewedSelectSchema
>;

export const courseLastViewedTableRelations = relations(
  courseLastViewedTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [courseLastViewedTable.userId],
      references: [userProfileTable.userId],
    }),
    course: one(coursesTable, {
      fields: [courseLastViewedTable.courseId],
      references: [coursesTable.id],
    }),
    lesson: one(lessonsTable, {
      fields: [courseLastViewedTable.lessonId],
      references: [lessonsTable.id],
    }),
  }),
);

export const courseSubscriptionsTableRelations = relations(
  courseSubscriptionsTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [courseSubscriptionsTable.userId],
      references: [userProfileTable.userId],
    }),
    course: one(coursesTable, {
      fields: [courseSubscriptionsTable.courseId],
      references: [coursesTable.id],
    }),
  }),
);

export const courseOnboardingTable = pgTable(
  'course_onboarding',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    // questionId -> answer text. Defaults to {} rather than null so "not
    // answered yet" is an empty map, not a null check in every consumer.
    answers: jsonb('answers')
      .$type<z.infer<typeof OnboardingAnswersSchema>>()
      .notNull()
      .default({}),
    // The question set this row was last reconciled against. Null until the
    // first answer is written. Flags stale responses in admin views; it does
    // NOT decide re-prompting — pendingQuestions() does.
    questionSetHash: varchar('question_set_hash', { length: 64 }),
    // 'admin' | 'default' — the question source, frozen when the row is
    // created. Without this, an admin adding the first question to a course
    // would flip the effective set, orphan every default answer, and
    // re-interview users who had already finished.
    questionSource: varchar('question_source', { length: 16 }),
    // Set when the user declines the consent framing. The row persists with an
    // empty answers map so onboarding is never auto-offered again — declining
    // is respected, not re-pitched on the next visit.
    consentDeclinedAt: timestamp('consent_declined_at', { mode: 'date' }),
    // Set when the user asks to delete everything they've shared. The row is
    // kept as a tombstone — answers cleared, transcript removed — so the agent
    // never re-offers onboarding to someone who withdrew. Distinct from
    // consentDeclinedAt, which means they never started.
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
    // The machine's settled state after the last turn, from
    // actor.getPersistedSnapshot(). Restored with
    // createActor(machine, { snapshot }).
    //
    // Load-bearing, not a convenience: eight of OnboardingContext's ten
    // fields are not reconstructible from other columns, so rebuilding
    // context fresh each request would reset followUpCount and
    // consentClarificationCount every turn — silently disabling both caps.
    machineSnapshot: jsonb('machine_snapshot').$type<Record<string, unknown>>(),
    // Guards the snapshot across deploys that change the machine's shape. On
    // mismatch the snapshot is discarded and the machine starts fresh, which
    // is safe: `answers` is durable, so pendingQuestions() resumes the user
    // at their next unanswered question. Because the failure mode is mild,
    // the guard is deliberately biased toward discarding.
    machineVersion: varchar('machine_version', { length: 32 }),
    // Null means in-progress and resumable.
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // One record per user per course. This is what makes the incremental-save
    // upsert safe against double-submit, concurrent tabs, and retried requests.
    uniqueIndex('course_onboarding_user_course_idx').on(
      table.userId,
      table.courseId,
    ),
    // The unique index is user-first, so it will not serve the admin
    // "all responses for this course" query.
    index('course_onboarding_course_id_idx').on(table.courseId),
  ],
);

export const courseOnboardingInsertSchema = createInsertSchema(
  courseOnboardingTable,
  {
    // drizzle-zod applies a column override verbatim, discarding the
    // optional-wrapping it would otherwise derive from the column's DB
    // default. Restate `.optional()` here so an insert that omits `answers`
    // (relying on the column default of `{}`) still validates. Mirrors
    // userProfileInsertSchema above for the same reason.
    answers: OnboardingAnswersSchema.optional(),
  },
);
export type CourseOnboardingInsert = z.infer<
  typeof courseOnboardingInsertSchema
>;

export const courseOnboardingSelectSchema = createSelectSchema(
  courseOnboardingTable,
  {
    answers: OnboardingAnswersSchema,
  },
);
export type CourseOnboardingSelect = z.infer<
  typeof courseOnboardingSelectSchema
>;

export const courseOnboardingTableRelations = relations(
  courseOnboardingTable,
  ({ one, many }) => ({
    user: one(userProfileTable, {
      fields: [courseOnboardingTable.userId],
      references: [userProfileTable.userId],
    }),
    course: one(coursesTable, {
      fields: [courseOnboardingTable.courseId],
      references: [coursesTable.id],
    }),
    messages: many(courseOnboardingMessagesTable),
  }),
);

export const courseOnboardingMessagesTable = pgTable(
  'course_onboarding_messages',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    onboardingId: integer('onboarding_id')
      .notNull()
      .references(() => courseOnboardingTable.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(), // 'assistant' | 'user'
    // Mirrors aiMessages.parts so these rows are compatible with the AI SDK
    // UIMessage shape when the UI is wired.
    parts: jsonb('parts').notNull(),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // A retried request must not append the same turn twice.
    uniqueIndex('course_onboarding_messages_onboarding_order_idx').on(
      table.onboardingId,
      table.order,
    ),
    index('course_onboarding_messages_onboarding_id_idx').on(
      table.onboardingId,
    ),
  ],
);

export const courseOnboardingMessagesInsertSchema = createInsertSchema(
  courseOnboardingMessagesTable,
);
export type CourseOnboardingMessagesInsert = z.infer<
  typeof courseOnboardingMessagesInsertSchema
>;

export const courseOnboardingMessagesSelectSchema = createSelectSchema(
  courseOnboardingMessagesTable,
);
export type CourseOnboardingMessagesSelect = z.infer<
  typeof courseOnboardingMessagesSelectSchema
>;

export const courseOnboardingMessagesTableRelations = relations(
  courseOnboardingMessagesTable,
  ({ one }) => ({
    onboarding: one(courseOnboardingTable, {
      fields: [courseOnboardingMessagesTable.onboardingId],
      references: [courseOnboardingTable.id],
    }),
  }),
);

/**
 * A user's Skills / Knowledge / Attitude profile for one course, distilled
 * from their completed onboarding and then owned by them.
 *
 * THREE COLUMNS rather than one markdown blob — see `SkaProfileSchema` for
 * why the structure is a contract and not a formatting preference.
 *
 * All three are nullable and that is normal, not degenerate: the generator
 * leaves a section null rather than inferring one it cannot support, and the
 * user may clear one they disagree with.
 *
 * No `onboarding_id` FK, deliberately. The profile is keyed on the same
 * (user, course) pair as `course_onboarding` and outlives any particular
 * session row; pointing at the session would tie the user's own edited
 * content to a row whose whole purpose is to be tombstoned.
 */
export const userSkaProfileTable = pgTable(
  'user_ska_profile',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    skills: text('skills'),
    knowledge: text('knowledge'),
    attitude: text('attitude'),
    /**
     * When the user affirmed the profile, via the one button on the review
     * card or on the course page. Null until then.
     *
     * This column gates USE, not storage: the row is written the moment it is
     * generated (so an abandoned card loses nothing and the profile stays
     * editable), but nothing reads it into viper7's prompt until this is set.
     * An AI's inference about someone's character steers no conversation
     * before that person has seen it and said yes.
     *
     * It is set by the button press whether or not anything was edited.
     * Requiring an edit would permanently unpersonalise the user who reads
     * their profile, agrees with all of it, and closes the card — and
     * agreement is the success case, so it must not be the failing one.
     */
    reviewedAt: timestamp('reviewed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // One profile per user per course. Also what makes generation idempotent
    // against a retried turn — see `createSkaProfile`'s onConflictDoNothing.
    uniqueIndex('user_ska_profile_user_course_idx').on(
      table.userId,
      table.courseId,
    ),
    // Serves the no-course-in-context read, which scans this user's reviewed
    // profiles for the most recently updated one. The unique index above is
    // (user, course) so it cannot order by updated_at for a bare user lookup.
    index('user_ska_profile_user_updated_idx').on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const userSkaProfileInsertSchema =
  createInsertSchema(userSkaProfileTable);
export type UserSkaProfileInsert = z.infer<typeof userSkaProfileInsertSchema>;

export const userSkaProfileSelectSchema =
  createSelectSchema(userSkaProfileTable);
export type UserSkaProfileSelect = z.infer<typeof userSkaProfileSelectSchema>;

export const userSkaProfileTableRelations = relations(
  userSkaProfileTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [userSkaProfileTable.userId],
      references: [userProfileTable.userId],
    }),
    course: one(coursesTable, {
      fields: [userSkaProfileTable.courseId],
      references: [coursesTable.id],
    }),
  }),
);

export const docs = pgTable(
  'docs',
  {
    id: serial('id').primaryKey(),
    // Null = org-wide doc (shared across all courses); set = course-specific.
    courseId: integer('course_id').references(() => coursesTable.id, {
      onDelete: 'cascade',
    }),
    sourcePath: text('source_path').notNull(),
    heading: text('heading'),
    chunk: text('chunk').notNull(),
    // 1536 for gemini-embedding-001, 3072 for -large
    embedding: vector('embedding', { dimensions: 3072 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    // Course-scoped dedup key: the same source chunk can be embedded per
    // course. A unique constraint (not index) so it can be NULLS NOT DISTINCT —
    // org-wide rows (null course_id / null heading) still dedupe; Postgres
    // otherwise treats every NULL as a distinct value.
    unique('uniq_course_source_heading_chunk')
      .on(t.courseId, t.sourcePath, t.heading, t.chunk)
      .nullsNotDistinct(),
    // Filter embeddings by course before similarity search.
    index('docs_course_id_idx').on(t.courseId),
  ],
);

// Vector index for cosine similarity search over doc embeddings. pgvector's
// hnsw index on the native `vector` type caps at 2000 dimensions, but
// gemini-embedding-001 produces 3072-dim vectors — so the index is built on a
// `halfvec(3072)` cast instead (halfvec supports up to 4000 dims). searchKB's
// correctness does not depend on this index; it only affects query speed.
void sql`CREATE INDEX IF NOT EXISTS docs_embedding_hnsw ON docs USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);`;

export const docsInsertSchema = createInsertSchema(docs);
export type DocsInsert = z.infer<typeof docsInsertSchema>;

export const docsSelectSchema = createSelectSchema(docs);
export type DocsSelect = z.infer<typeof docsSelectSchema>;

export const docsRelations = relations(docs, ({ one }) => ({
  course: one(coursesTable, {
    fields: [docs.courseId],
    references: [coursesTable.id],
  }),
}));

export const docURLs = pgTable(
  'doc_urls',
  {
    id: serial('id').primaryKey(),
    // Null = org-wide; set = course-specific. Matches docs.courseId scoping.
    courseId: integer('course_id').references(() => coursesTable.id, {
      onDelete: 'cascade',
    }),
    sourcePath: text('source_path').notNull(),
    url: text('url'),
  },
  (t) => [
    unique('uniq_course_source_path_url')
      .on(t.courseId, t.sourcePath, t.url)
      .nullsNotDistinct(),
  ],
);

export const docURLsInsertSchema = createInsertSchema(docURLs);
export type DocURLsInsert = z.infer<typeof docURLsInsertSchema>;

export const docURLsSelectSchema = createSelectSchema(docURLs);
export type DocURLsSelect = z.infer<typeof docURLsSelectSchema>;

export const aiChats = pgTable(
  'ai_chats',
  {
    id: varchar('id', { length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (chat) => [index('chat_user_id_idx').on(chat.userId)],
);

export const aichatsRelations = relations(aiChats, ({ one, many }) => ({
  user: one(userProfileTable, {
    fields: [aiChats.userId],
    references: [userProfileTable.userId],
  }),
  messages: many(aiMessages),
}));

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: varchar('id', { length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chatId: varchar('chat_id', { length: 255 })
      .notNull()
      .references(() => aiChats.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull(),
    parts: json('parts').notNull(),
    order: integer('order').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (message) => [
    index('message_chat_id_idx').on(message.chatId),
    index('message_order_idx').on(message.order),
  ],
);

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  chat: one(aiChats, {
    fields: [aiMessages.chatId],
    references: [aiChats.id],
  }),
}));

export const personaTable = pgTable(
  'personas',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /**
     * Personas are org-level: any course in the org may author one and every
     * course in that org can select it. Which persona a given course actually
     * uses is stored one table over, on `course_orgs.personaId` — never here.
     */
    orgId: integer('org_id')
      .notNull()
      .references(() => orgsTable.id, { onDelete: 'cascade' }),
    /** A label, not prompt content — the system prompt never reads it. */
    name: text('name').notNull(),
    /** Published content. This — and only this — is what the chat reads. */
    content: jsonb('content').notNull().$type<z.infer<typeof PersonaSchema>>(),
    /**
     * Staged edits. The editor autosaves here (debounced, and via sendBeacon
     * on tab close) so a half-typed field can never reach a live system
     * prompt; `Publish` copies it into `content` and sets this back to null.
     * NULL therefore means "no unpublished changes" — the single predicate
     * behind the list's Draft badge and the Publish button's enabled state.
     */
    draftContent: jsonb('draft_content').$type<z.infer<typeof PersonaSchema>>(),
    /**
     * The org's fallback persona: used by any chat in this org with no
     * course-level override — including chats with no course in context at
     * all, which have no `course_orgs` row to read a selection from.
     *
     * A flag here rather than `organizations.default_persona_id` because that
     * would make the two tables mutually referential, which TypeScript can't
     * infer through. The partial unique index below enforces the same "at most
     * one per org" that a single FK column would.
     */
    isOrgDefault: boolean('is_org_default').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Scoped rather than global: two orgs must each be able to have a
    // persona called "Viper7".
    uniqueIndex('personas_org_name_idx').on(table.orgId, table.name),
    index('personas_org_id_idx').on(table.orgId),
    // At most one default per org, enforced by the database rather than by
    // remembering to clear the old one.
    uniqueIndex('personas_org_default_idx')
      .on(table.orgId)
      .where(sql`${table.isOrgDefault}`),
  ],
);

export const personaTableRelations = relations(personaTable, ({ one }) => ({
  org: one(orgsTable, {
    fields: [personaTable.orgId],
    references: [orgsTable.id],
  }),
}));

export const personaInsertSchema = createInsertSchema(personaTable, {
  content: PersonaSchema,
});
export const personaSelectSchema = createSelectSchema(personaTable, {
  content: PersonaSchema,
});

export const associateCountersTable = pgTable('associate_counters', {
  yymm: varchar('yymm', { length: 4 }).primaryKey().notNull(), // e.g., "2510"
  lastSerial: integer('last_serial').notNull(), // last issued 4-digit serial for this YYMM
  seededAt: timestamp('seeded_at', { mode: 'date' }), // optional audit
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});

export const orgsTable = pgTable('organizations', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  logoURL: text('logo_url'),
  // The org's fallback persona is `personas.is_org_default`, not a column
  // here. A `default_persona_id` FK would make organizations ⇄ personas
  // mutually referential, which TypeScript cannot infer through (TS7022) —
  // and it would also allow a dangling id. As a flag on the persona, deleting
  // the persona removes the default with it.
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const orgsInsertSchema = createInsertSchema(orgsTable);
export type OrgsInsert = z.infer<typeof orgsInsertSchema>;

export const orgsSelectSchema = createSelectSchema(orgsTable, {
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrgsSelect = z.infer<typeof orgsSelectSchema>;

export const orgsTableRelations = relations(orgsTable, ({ many }) => ({
  userOrganizations: many(userOrgTable),
  orgLessons: many(orgLessonsTable),
  personas: many(personaTable),
  courseOrgs: many(courseOrgsTable),
  // `defaultPersonaId` is deliberately not declared as a relation: it would be
  // a second, one-directional orgs→personas edge alongside `personas`, which
  // Drizzle can't disambiguate without naming both sides. Every reader joins
  // it explicitly instead.
}));

export const userOrgTable = pgTable(
  'user_organizations',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userRoles: varchar('user_roles', { length: 255 })
      .array()
      .default([])
      .notNull(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('user_orgs_user_org_idx').on(table.userId, table.orgId),
  ],
);

export const userOrgTableRelations = relations(userOrgTable, ({ one }) => ({
  user: one(userProfileTable, {
    fields: [userOrgTable.userId],
    references: [userProfileTable.userId],
  }),
  org: one(orgsTable, {
    fields: [userOrgTable.orgId],
    references: [orgsTable.id],
  }),
}));

export const orgLessonsTable = pgTable(
  'organization_lessons',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgsTable.id, { onDelete: 'cascade' }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessonsTable.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('org_lessons_org_lesson_idx').on(table.orgId, table.lessonId),
    index('org_lessons_org_id_idx').on(table.orgId),
    index('org_lessons_lesson_id_idx').on(table.lessonId),
  ],
);

export const orgLessonsTableRelations = relations(
  orgLessonsTable,
  ({ one }) => ({
    org: one(orgsTable, {
      fields: [orgLessonsTable.orgId],
      references: [orgsTable.id],
    }),
    lesson: one(lessonsTable, {
      fields: [orgLessonsTable.lessonId],
      references: [lessonsTable.id],
    }),
  }),
);

/**
 * Course ↔ org membership, and the persona that course runs *for that org*.
 *
 * Both sides are many-to-many: an org has many courses, and a course can be
 * shared with many orgs (which is what `organization_lessons` already assumes
 * — it layers org-specific lessons onto a shared course). So "which persona
 * does this course use" has no single answer at the course level, and
 * `personaId` lives here rather than on `courses`. Keeping it on the join row
 * also means a selection can never point at another org's persona: the org is
 * part of the same row.
 *
 * NULL `personaId` means "no course-level override" — the chat falls through
 * to `orgs.defaultPersonaId`.
 */
export const courseOrgsTable = pgTable(
  'course_orgs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgsTable.id, { onDelete: 'cascade' }),
    personaId: integer('persona_id').references(() => personaTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('course_orgs_course_org_idx').on(table.courseId, table.orgId),
    index('course_orgs_org_id_idx').on(table.orgId),
    index('course_orgs_persona_id_idx').on(table.personaId),
  ],
);

export const courseOrgsTableRelations = relations(
  courseOrgsTable,
  ({ one }) => ({
    course: one(coursesTable, {
      fields: [courseOrgsTable.courseId],
      references: [coursesTable.id],
    }),
    org: one(orgsTable, {
      fields: [courseOrgsTable.orgId],
      references: [orgsTable.id],
    }),
    persona: one(personaTable, {
      fields: [courseOrgsTable.personaId],
      references: [personaTable.id],
    }),
  }),
);

export const accountDeletionRequestsTable = pgTable(
  'account_deletion_requests',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .unique()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
);

export const airportsTable = pgTable('airports', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  // ICAO code of this airport. May also be a combination of country code and a number. e.g. LEMD, EHTX, ES-0071 etc.
  icao: varchar('icao').unique().notNull(),
  name: text('name').notNull(),
  lat: numeric('lat', { precision: 10, scale: 5 }).notNull(),
  lng: numeric('lng', { precision: 10, scale: 5 }).notNull(),
  countryCode: varchar('country_code', { length: 2 }).notNull(),
});

export const lessonTestResultsTable = pgTable(
  'lesson_test_results',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    lessonSlug: text('lesson_slug')
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: 'cascade' }),
    questions: json('questions').notNull(),
    answers: json('answers').notNull().default([]),
    totalScore: integer('total_score'),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('lesson_test_results_user_id_idx').on(table.userId),
    index('lesson_test_results_user_lesson_idx').on(
      table.userId,
      table.lessonSlug,
    ),
  ],
);

export const lessonTestResultsInsertSchema = createInsertSchema(
  lessonTestResultsTable,
);
export type LessonTestResultsInsert = z.infer<
  typeof lessonTestResultsInsertSchema
>;

export const lessonTestResultsSelectSchema = createSelectSchema(
  lessonTestResultsTable,
);
export type LessonTestResultsSelect = z.infer<
  typeof lessonTestResultsSelectSchema
>;

export const lessonTestResultsTableRelations = relations(
  lessonTestResultsTable,
  ({ one }) => ({
    user: one(userProfileTable, {
      fields: [lessonTestResultsTable.userId],
      references: [userProfileTable.userId],
    }),
    lesson: one(lessonsTable, {
      fields: [lessonTestResultsTable.lessonSlug],
      references: [lessonsTable.slug],
    }),
  }),
);
