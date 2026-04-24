import {
  integer,
  pgTable,
  primaryKey,
  varchar,
  timestamp,
  index,
  json,
  text,
  numeric,
  uuid,
  jsonb,
  boolean,
  vector,
  serial,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { z } from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  CourseLessonQuizAnswerSchema,
  CourseLessonQuizSchema,
  CourseLessonDependenciesSchema,
  SubscriptionsSchema,
  CourseLessonQuizAnswersSchema,
  AddressSchema,
  PilotLicensesSchema,
  ProfileVisibilitySchema,
  PersonaSchema,
  OtherVideoIdsSchema,
} from "@/types";


export * from "./auth-schema";

export const coursesTable = pgTable("courses", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const dbCourseSchema = createSelectSchema(coursesTable);
export type DBCourse = z.infer<typeof dbCourseSchema>;

export const coursesTableRelations = relations(coursesTable, ({ many }) => ({
  modules: many(modulesTable),
  subscriptions: many(courseSubscriptionsTable),
}));

export const modulesTable = pgTable("modules", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  courseId: integer("course_id")
    .notNull()
    .references(() => coursesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  requiredSubscriptions: text("required_subscriptions").array().notNull(),
  rank: numeric("rank", { precision: 10, scale: 5 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const dbModuleSchema = createSelectSchema(modulesTable, {
  requiredSubscriptions: SubscriptionsSchema,
});
export type DBModule = z.infer<typeof dbModuleSchema>;

export const modulesTableRelations = relations(modulesTable, ({ one, many }) => ({
  course: one(coursesTable, {
    fields: [modulesTable.courseId],
    references: [coursesTable.id],
  }),
  lessons: many(lessonsTable),
  fileAssignments: many(blobFileAssignmentsTable),
}));

// GIN index for required_subscriptions
void sql`CREATE INDEX IF NOT EXISTS idx_modules_required_subs ON modules USING GIN (required_subscriptions);`;

export const lessonsTable = pgTable("lessons", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  moduleId: integer("module_id")
    .notNull()
    .references(() => modulesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  videoId: uuid("video_id"),
  otherVideoIds: jsonb("other_video_ids").$type<z.infer<typeof OtherVideoIdsSchema>>().default([]),
  requiredSubscriptions: text("required_subscriptions").array().notNull(),
  rank: numeric("rank", { precision: 10, scale: 5 }).notNull(),
  isAvailable: boolean("is_available").notNull().default(false),
  exclusivePerDay: boolean("exclusive_per_day").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const dbLessonSchema = createSelectSchema(lessonsTable, {
  requiredSubscriptions: SubscriptionsSchema,
});
export type DBLesson = z.infer<typeof dbLessonSchema>;

export const lessonsTableRelations = relations(lessonsTable, ({ one, many }) => ({
  module: one(modulesTable, {
    fields: [lessonsTable.moduleId],
    references: [modulesTable.id],
  }),
  quizAnswers: many(lessonQuizAnswersTable),
  material: many(lessonMaterialTable),
  fileAssignments: many(blobFileAssignmentsTable),
  favKeyPoints: many(favKeyPointsTable),
  orgLessons: many(orgLessonsTable),
}));

// GIN index for required_subscriptions
void sql`CREATE INDEX IF NOT EXISTS idx_lessons_required_subs ON lessons USING GIN (required_subscriptions);`;

export const moduleDependenciesTable = pgTable(
  "module_dependencies",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    moduleId: integer("module_id")
      .unique()
      .notNull()
      .references(() => modulesTable.id, { onDelete: "cascade" }),
    dependsOn: text("depends_on").array().notNull(),
  },
  (table) => [index("module_depends_on_idx").on(table.dependsOn)],
);

export const lessonDependenciesTable = pgTable("lesson_dependencies", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  lessonId: integer("lesson_id")
    .unique()
    .notNull()
    .references(() => lessonsTable.id, { onDelete: "cascade" }),
  dependsOn: jsonb("depends_on").$type<z.infer<typeof CourseLessonDependenciesSchema>>().notNull(),
});

// GIN index for JSONB depends_on field
void sql`CREATE INDEX IF NOT EXISTS idx_lesson_dependencies_depends_on ON lesson_dependencies USING GIN (depends_on);`;

export const videoProgressTable = pgTable(
  "videos_progress",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    videoId: varchar("video_id", { length: 255 }).notNull(),
    progress: integer().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("videos_progress_user_id_idx").on(table.userId),
    index("videos_progress_user_video_idx").on(table.userId, table.videoId),
  ],
);

export const videoProgressInsertSchema = createInsertSchema(videoProgressTable);
export type VideoProgressInsert = z.infer<typeof videoProgressInsertSchema>;

export const videoProgressSelectSchema = createSelectSchema(videoProgressTable);
export type VideoProgressSelect = z.infer<typeof videoProgressSelectSchema>;

export const videoProgressTableRelations = relations(videoProgressTable, ({ one }) => ({
  user: one(userProfileTable, {
    fields: [videoProgressTable.userId],
    references: [userProfileTable.userId],
  }),
}));

export const lessonQuizAnswersTable = pgTable(
  "lesson_quiz_answers",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    lessonSlug: varchar("lesson_slug", { length: 255 })
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: "cascade" }),
    answers: json("answers").$type<z.infer<typeof CourseLessonQuizAnswersSchema>>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("lesson_quiz_answers_user_id_idx").on(table.userId),
    index("lesson_quiz_answers_user_lesson_idx").on(table.userId, table.lessonSlug),
  ],
);

export const lessonQuizAnswersInsertSchema = createInsertSchema(lessonQuizAnswersTable, {
  answers: CourseLessonQuizAnswersSchema,
});
export type LessonQuizAnswersInsert = z.infer<typeof lessonQuizAnswersInsertSchema>;

export const lessonQuizAnswersSelectSchema = createSelectSchema(lessonQuizAnswersTable, {
  answers: CourseLessonQuizAnswerSchema,
});
export type LessonQuizAnswersSelect = z.infer<typeof lessonQuizAnswersSelectSchema>;

export const lessonQuizAnswersTableRelations = relations(lessonQuizAnswersTable, ({ one }) => ({
  user: one(userProfileTable, {
    fields: [lessonQuizAnswersTable.userId],
    references: [userProfileTable.userId],
  }),
  lesson: one(lessonsTable, {
    fields: [lessonQuizAnswersTable.lessonSlug],
    references: [lessonsTable.slug],
  }),
}));

export const lessonMaterialTable = pgTable(
  "lesson_material",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lessonSlug: text("lesson_slug")
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: "cascade" }),
    text: text("text").notNull(),
    keyPoints: json("key_points").$type<string[]>(),
    quiz: json("quiz").$type<z.infer<typeof CourseLessonQuizSchema>>(),
    proTips: text("pro_tips"),
    links: text("links").array(),
    assignments: text("assignments"),
    jobOfTheDay: text("job_of_the_day"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("lesson_material_lesson_slug_idx").on(table.lessonSlug)],
);

export const lessonMaterialInsertSchema = createInsertSchema(lessonMaterialTable, {
  quiz: CourseLessonQuizSchema,
});
export type LessonMaterialInsert = z.infer<typeof lessonMaterialInsertSchema>;

export const lessonMaterialSelectSchema = createSelectSchema(lessonMaterialTable, {
  quiz: CourseLessonQuizSchema,
});
export type LessonMaterialSelect = z.infer<typeof lessonMaterialSelectSchema>;

export const lessonMaterialTableRelations = relations(lessonMaterialTable, ({ one }) => ({
  lesson: one(lessonsTable, {
    fields: [lessonMaterialTable.lessonSlug],
    references: [lessonsTable.slug],
  }),
}));

export const lessonMaterialProgressTable = pgTable(
  "lesson_material_progress",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    lessonSlug: varchar("lesson_slug", { length: 255 })
      .notNull()
      .references(() => lessonsTable.slug, { onDelete: "cascade" }),
    sectionName: text("section_name").notNull(),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lesson_material_progress_user_lesson_section_idx").on(
      table.userId,
      table.lessonSlug,
      table.sectionName,
    ),
  ],
);

export const lessonMaterialProgressInsertSchema = createInsertSchema(lessonMaterialProgressTable);
export type LessonMaterialProgressInsert = z.infer<typeof lessonMaterialProgressInsertSchema>;

export const lessonMaterialProgressSelectSchema = createSelectSchema(lessonMaterialProgressTable);
export type LessonMaterialProgressSelect = z.infer<typeof lessonMaterialProgressSelectSchema>;

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
  "fav_key_points",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    lessonSlug: varchar("lesson_slug", { length: 255 }).references(() => lessonsTable.slug, {
      onDelete: "cascade",
    }),
    keyPoint: text("key_point").notNull(),
  },
  (table) => [
    uniqueIndex("fav_key_points_user_lesson_key_point_idx").on(
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
  "blob_files",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    url: varchar({ length: 500 }).notNull(),
    size: integer().notNull(),
    type: varchar({ length: 100 }).notNull(),
    uploadedBy: varchar({ length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("blob_files_uploaded_by_idx").on(table.uploadedBy),
    index("blob_files_created_at_idx").on(table.createdAt),
    index("blob_files_url_idx").on(table.url),
  ],
);

export const blobFilesInsertSchema = createInsertSchema(blobFilesTable);
export type BlobFilesInsert = z.infer<typeof blobFilesInsertSchema>;

export const blobFilesSelectSchema = createSelectSchema(blobFilesTable);
export type BlobFilesSelect = z.infer<typeof blobFilesSelectSchema>;

export const blobFilesTableRelations = relations(blobFilesTable, ({ many }) => ({
  assignments: many(blobFileAssignmentsTable),
}));

export const blobFileAssignmentsTable = pgTable(
  "blob_file_assignments",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    fileId: integer("file_id")
      .notNull()
      .references(() => blobFilesTable.id, { onDelete: "cascade" }),
    moduleSlug: varchar("module_slug", { length: 255 }).references(() => modulesTable.slug, {
      onDelete: "cascade",
    }),
    lessonSlug: varchar("lesson_slug", { length: 255 }).references(() => lessonsTable.slug, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("blob_file_assignments_file_id_idx").on(table.fileId),
    index("blob_file_assignments_module_slug_idx").on(table.moduleSlug),
    index("blob_file_assignments_lesson_slug_idx").on(table.lessonSlug),
  ],
);

// Add foreign key relationship
export const blobFileAssignmentsRelations = relations(blobFileAssignmentsTable, ({ one }) => ({
  file: one(blobFilesTable, {
    fields: [blobFileAssignmentsTable.fileId],
    references: [blobFilesTable.id],
  }),
  module: one(modulesTable, {
    fields: [blobFileAssignmentsTable.moduleSlug],
    references: [modulesTable.slug],
  }),
  lesson: one(lessonsTable, {
    fields: [blobFileAssignmentsTable.lessonSlug],
    references: [lessonsTable.slug],
  }),
}));

export const blobFileAssignmentsInsertSchema = createInsertSchema(blobFileAssignmentsTable);
export type BlobFileAssignmentsInsert = z.infer<typeof blobFileAssignmentsInsertSchema>;

export const blobFileAssignmentsSelectSchema = createSelectSchema(blobFileAssignmentsTable);
export type BlobFileAssignmentsSelect = z.infer<typeof blobFileAssignmentsSelectSchema>;

export const userProfileTable = pgTable(
  "user_profiles",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 }).notNull().unique(),
    associateNumber: varchar("associate_number", { length: 12 }).unique(),
    callSign: varchar("call_sign", { length: 100 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    email: varchar("email", { length: 100 }).notNull().unique(),
    phoneNumber: varchar("phone_number", { length: 100 }),
    avatarURL: varchar("avatar_url"),
    age: integer("age"),
    gender: varchar("gender", { enum: ["M", "F"] }),
    pilotLicenses: json("pilot_licenses").$type<z.infer<typeof PilotLicensesSchema>>().array(),
    uasLicenseCountry: varchar("uas_license_country", { length: 3 }), // 3 letter country code
    uasLicenseType: varchar("uas_license_type").array(),
    uasType: varchar("uas_type").array(),
    uasWeightClass: varchar("uas_weight_class"),
    address: json("address").$type<z.infer<typeof AddressSchema>>(),
    visibility: json("visibility").$type<z.infer<typeof ProfileVisibilitySchema>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("user_profile_user_id_idx").on(table.userId),
    index("user_profile_call_sign_idx").on(table.callSign),
    index("user_profile_first_name_idx").on(table.firstName),
    index("user_profile_last_name_idx").on(table.lastName),
    index("user_profile_created_at_idx").on(table.createdAt),
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

export const userProfileTableRelations = relations(userProfileTable, ({ many }) => ({
  aiChats: many(aiChats),
  videoProgress: many(videoProgressTable),
  lessonQuizAnswers: many(lessonQuizAnswersTable),
  lessonMaterialProgress: many(lessonMaterialProgressTable),
  courseSubscriptions: many(courseSubscriptionsTable),
  userNewsSources: many(userNewsSourcesTable),
  favKeyPoints: many(favKeyPointsTable),
  userRoles: many(userProfileRolesTable),
  userOrganizations: many(userOrgTable),
}));

export const userRolesTable = pgTable(
  "user_roles",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Use enum for integrity; make it unique so each logical role appears once.
    name: varchar("name", { length: 100 }).notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("user_roles_name_idx").on(t.name)],
);

export const userRolesInsertSchema = createInsertSchema(userRolesTable);
export type UserRolesInsert = z.infer<typeof userRolesInsertSchema>;

export const userRolesSelectSchema = createSelectSchema(userRolesTable);
export type UserRolesSelect = z.infer<typeof userRolesSelectSchema>;

export const userRolesTableRelations = relations(userRolesTable, ({ many }) => ({
  users: many(userProfileRolesTable),
}));

export const userProfileRolesTable = pgTable(
  "user_profile_roles",
  {
    userProfileId: integer("user_profile_id")
      .notNull()
      .references(() => userProfileTable.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => userRolesTable.id, { onDelete: "restrict" }),
    assignedBy: varchar("assigned_by", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userProfileId, t.roleId], name: "upr_pk" }),
    index("upr_user_idx").on(t.userProfileId),
    index("upr_role_idx").on(t.roleId),
  ],
);

export const userProfileRolesRelations = relations(userProfileRolesTable, ({ one }) => ({
  userProfile: one(userProfileTable, {
    fields: [userProfileRolesTable.userProfileId],
    references: [userProfileTable.id],
  }),
  role: one(userRolesTable, {
    fields: [userProfileRolesTable.roleId],
    references: [userRolesTable.id],
  }),
}));

export const newsSourcesTable = pgTable("news_sources", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  selectors: text("selectors").array().default([]),
  imageURL: text("image_url").notNull(),
  tintColor: text("tint_color"),
  active: boolean("active").notNull().default(true),
  rank: numeric("rank", { precision: 10, scale: 5 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const newsSourcesInsertSchema = createInsertSchema(newsSourcesTable);
export type NewsSourcesInsert = z.infer<typeof newsSourcesInsertSchema>;

export const newsSourcesSelectSchema = createSelectSchema(newsSourcesTable);
export type NewsSourcesSelect = z.infer<typeof newsSourcesSelectSchema>;

export const newsSourcesTableRelations = relations(newsSourcesTable, ({ many }) => ({
  userNewsSources: many(userNewsSourcesTable),
}));

export const userNewsSourcesTable = pgTable(
  "user_news_sources",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    newsSourceId: integer("news_source_id")
      .notNull()
      .references(() => newsSourcesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("user_news_sources_user_source_idx").on(table.userId, table.newsSourceId),
  ],
);

export const userNewsSourcesInsertSchema = createInsertSchema(userNewsSourcesTable);
export type UserNewsSourcesInsert = z.infer<typeof userNewsSourcesInsertSchema>;

export const userNewsSourcesSelectSchema = createSelectSchema(userNewsSourcesTable);
export type UserNewsSourcesSelect = z.infer<typeof userNewsSourcesSelectSchema>;

export const userNewsSourcesTableRelations = relations(userNewsSourcesTable, ({ one }) => ({
  user: one(userProfileTable, {
    fields: [userNewsSourcesTable.userId],
    references: [userProfileTable.userId],
  }),
  newsSource: one(newsSourcesTable, {
    fields: [userNewsSourcesTable.newsSourceId],
    references: [newsSourcesTable.id],
  }),
}));

export const helpTopicsTable = pgTable("help_topics", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull().unique(),
  content: text("content").notNull(),
  rank: numeric("rank", { precision: 10, scale: 5 }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const helpTopicsInsertSchema = createInsertSchema(helpTopicsTable);
export type HelpTopicsInsert = z.infer<typeof helpTopicsInsertSchema>;

export const helpTopicsSelectSchema = createSelectSchema(helpTopicsTable);
export type HelpTopicsSelect = z.infer<typeof helpTopicsSelectSchema>;
export const courseSubscriptionsTable = pgTable(
  "course_subscriptions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    courseId: integer("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("course_subscriptions_user_course_idx").on(table.userId, table.courseId)],
);

export const courseSubscriptionsTableRelations = relations(courseSubscriptionsTable, ({ one }) => ({
  user: one(userProfileTable, {
    fields: [courseSubscriptionsTable.userId],
    references: [userProfileTable.userId],
  }),
  course: one(coursesTable, {
    fields: [courseSubscriptionsTable.courseId],
    references: [coursesTable.id],
  }),
}));

export const docs = pgTable(
  "docs",
  {
    id: serial("id").primaryKey(),
    sourcePath: text("source_path").notNull(),
    heading: text("heading"),
    chunk: text("chunk").notNull(),
    // 1536 for gemini-embedding-001, 3072 for -large
    embedding: vector("embedding", { dimensions: 3072 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uniq_source_heading_chunk").on(t.sourcePath, t.heading, t.chunk)],
);

export const docURLs = pgTable(
  "doc_urls",
  {
    id: serial("id").primaryKey(),
    sourcePath: text("source_path").notNull(),
    url: text("url"),
  },
  (t) => [uniqueIndex("uniq_source_path_url").on(t.sourcePath, t.url)],
);

export const docURLsInsertSchema = createInsertSchema(docURLs);
export type DocURLsInsert = z.infer<typeof docURLsInsertSchema>;

export const docURLsSelectSchema = createSelectSchema(docURLs);
export type DocURLsSelect = z.infer<typeof docURLsSelectSchema>;

export const aiChats = pgTable(
  "ai_chats",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (chat) => [index("chat_user_id_idx").on(chat.userId)],
);

export const aichatsRelations = relations(aiChats, ({ one, many }) => ({
  user: one(userProfileTable, {
    fields: [aiChats.userId],
    references: [userProfileTable.userId],
  }),
  messages: many(aiMessages),
}));

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chatId: varchar("chat_id", { length: 255 })
      .notNull()
      .references(() => aiChats.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull(),
    parts: json("parts").notNull(),
    order: integer("order").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (message) => [
    index("message_chat_id_idx").on(message.chatId),
    index("message_order_idx").on(message.order),
  ],
);

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  chat: one(aiChats, {
    fields: [aiMessages.chatId],
    references: [aiChats.id],
  }),
}));

export const personaTable = pgTable("personas", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  content: jsonb("content").notNull().$type<z.infer<typeof PersonaSchema>>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const personaInsertSchema = createInsertSchema(personaTable, {
  content: PersonaSchema,
});
export const personaSelectSchema = createSelectSchema(personaTable, {
  content: PersonaSchema,
});

export const associateCountersTable = pgTable("associate_counters", {
  yymm: varchar("yymm", { length: 4 }).primaryKey().notNull(), // e.g., "2510"
  lastSerial: integer("last_serial").notNull(), // last issued 4-digit serial for this YYMM
  seededAt: timestamp("seeded_at", { mode: "date" }), // optional audit
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

export const orgsTable = pgTable("organizations", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  logoURL: text("logo_url"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
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
}));

export const userOrgTable = pgTable(
  "user_organizations",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userRoles: varchar("user_roles", { length: 255 }).array().default([]).notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: "cascade" }),
    orgId: integer("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("user_orgs_user_org_idx").on(table.userId, table.orgId)],
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
  "organization_lessons",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessonsTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("org_lessons_org_lesson_idx").on(table.orgId, table.lessonId),
    index("org_lessons_org_id_idx").on(table.orgId),
    index("org_lessons_lesson_id_idx").on(table.lessonId),
  ],
);

export const orgLessonsTableRelations = relations(orgLessonsTable, ({ one }) => ({
  org: one(orgsTable, {
    fields: [orgLessonsTable.orgId],
    references: [orgsTable.id],
  }),
  lesson: one(lessonsTable, {
    fields: [orgLessonsTable.lessonId],
    references: [lessonsTable.id],
  }),
}));

export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => userProfileTable.userId, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const airportsTable = pgTable("airports", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  // ICAO code of this airport. May also be a combination of country code and a number. e.g. LEMD, EHTX, ES-0071 etc.
  icao: varchar("icao").unique().notNull(),
  name: text("name").notNull(),
  lat: numeric("lat", { precision: 10, scale: 5 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 5 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
});
