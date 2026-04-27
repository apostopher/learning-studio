CREATE TABLE "account_deletion_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_deletion_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_requests_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ai_chats" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"parts" json NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "airports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"icao" varchar NOT NULL,
	"name" text NOT NULL,
	"lat" numeric(10, 5) NOT NULL,
	"lng" numeric(10, 5) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	CONSTRAINT "airports_icao_unique" UNIQUE("icao")
);
--> statement-breakpoint
CREATE TABLE "associate_counters" (
	"yymm" varchar(4) PRIMARY KEY NOT NULL,
	"last_serial" integer NOT NULL,
	"seeded_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blob_file_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blob_file_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"file_id" integer NOT NULL,
	"module_slug" varchar(255),
	"lesson_slug" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blob_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blob_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"url" varchar(500) NOT NULL,
	"size" integer NOT NULL,
	"type" varchar(100) NOT NULL,
	"uploadedBy" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "courses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "doc_urls" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_path" text NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_path" text NOT NULL,
	"heading" text,
	"chunk" text NOT NULL,
	"embedding" vector(3072) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fav_key_points" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fav_key_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" varchar(255),
	"key_point" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_topics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "help_topics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"content" text NOT NULL,
	"rank" numeric(10, 5) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "help_topics_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "lesson_dependencies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lesson_id" integer NOT NULL,
	"depends_on" jsonb NOT NULL,
	CONSTRAINT "lesson_dependencies_lesson_id_unique" UNIQUE("lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_material_progress" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_material_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" varchar(255) NOT NULL,
	"section_name" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_material" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_material_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lesson_slug" text NOT NULL,
	"text" text NOT NULL,
	"key_points" json,
	"quiz" json,
	"pro_tips" text,
	"links" text[],
	"assignments" text,
	"job_of_the_day" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_quiz_answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_quiz_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" varchar(255) NOT NULL,
	"answers" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lessons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"module_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"video_id" uuid,
	"other_video_ids" jsonb DEFAULT '[]'::jsonb,
	"required_subscriptions" text[] NOT NULL,
	"rank" numeric(10, 5) NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"exclusive_per_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "module_dependencies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "module_dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"module_id" integer NOT NULL,
	"depends_on" text[] NOT NULL,
	CONSTRAINT "module_dependencies_module_id_unique" UNIQUE("module_id")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "modules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"required_subscriptions" text[] NOT NULL,
	"rank" numeric(10, 5) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "modules_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"url" text NOT NULL,
	"selectors" text[] DEFAULT '{}',
	"image_url" text NOT NULL,
	"tint_color" text,
	"active" boolean DEFAULT true NOT NULL,
	"rank" numeric(10, 5) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "organization_lessons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_lessons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"lesson_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_news_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_news_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"news_source_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_roles" varchar(255)[] DEFAULT '{}' NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"org_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile_roles" (
	"user_profile_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upr_pk" PRIMARY KEY("user_profile_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"associate_number" varchar(12),
	"call_sign" varchar(100),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"email" varchar(100) NOT NULL,
	"phone_number" varchar(100),
	"avatar_url" varchar,
	"age" integer,
	"gender" varchar,
	"pilot_licenses" json[],
	"uas_license_country" varchar(3),
	"uas_license_type" varchar[],
	"uas_type" varchar[],
	"uas_weight_class" varchar,
	"address" json,
	"visibility" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_profiles_associate_number_unique" UNIQUE("associate_number"),
	CONSTRAINT "user_profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "videos_progress" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "videos_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"video_id" varchar(255) NOT NULL,
	"progress" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"refresh_token_expires_at" timestamp NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"scopes" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "oauth_access_token_access_token_unique" UNIQUE("access_token"),
	CONSTRAINT "oauth_access_token_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "oauth_application" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"metadata" text,
	"client_id" text NOT NULL,
	"client_secret" text,
	"redirect_urls" text NOT NULL,
	"type" text NOT NULL,
	"disabled" boolean DEFAULT false,
	"user_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "oauth_application_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scopes" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"consent_given" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_chat_id_ai_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_file_id_blob_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."blob_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_module_slug_modules_slug_fk" FOREIGN KEY ("module_slug") REFERENCES "public"."modules"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_subscriptions" ADD CONSTRAINT "course_subscriptions_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_subscriptions" ADD CONSTRAINT "course_subscriptions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fav_key_points" ADD CONSTRAINT "fav_key_points_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fav_key_points" ADD CONSTRAINT "fav_key_points_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_dependencies" ADD CONSTRAINT "lesson_dependencies_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_material_progress" ADD CONSTRAINT "lesson_material_progress_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_material_progress" ADD CONSTRAINT "lesson_material_progress_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_material" ADD CONSTRAINT "lesson_material_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_quiz_answers" ADD CONSTRAINT "lesson_quiz_answers_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_quiz_answers" ADD CONSTRAINT "lesson_quiz_answers_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_dependencies" ADD CONSTRAINT "module_dependencies_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_lessons" ADD CONSTRAINT "organization_lessons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_lessons" ADD CONSTRAINT "organization_lessons_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_news_sources" ADD CONSTRAINT "user_news_sources_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_news_sources" ADD CONSTRAINT "user_news_sources_news_source_id_news_sources_id_fk" FOREIGN KEY ("news_source_id") REFERENCES "public"."news_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_roles" ADD CONSTRAINT "user_profile_roles_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile_roles" ADD CONSTRAINT "user_profile_roles_role_id_user_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."user_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos_progress" ADD CONSTRAINT "videos_progress_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_application" ADD CONSTRAINT "oauth_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_user_id_idx" ON "ai_chats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_chat_id_idx" ON "ai_messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "message_order_idx" ON "ai_messages" USING btree ("order");--> statement-breakpoint
CREATE INDEX "blob_file_assignments_file_id_idx" ON "blob_file_assignments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "blob_file_assignments_module_slug_idx" ON "blob_file_assignments" USING btree ("module_slug");--> statement-breakpoint
CREATE INDEX "blob_file_assignments_lesson_slug_idx" ON "blob_file_assignments" USING btree ("lesson_slug");--> statement-breakpoint
CREATE INDEX "blob_files_uploaded_by_idx" ON "blob_files" USING btree ("uploadedBy");--> statement-breakpoint
CREATE INDEX "blob_files_created_at_idx" ON "blob_files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "blob_files_url_idx" ON "blob_files" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "course_subscriptions_user_course_idx" ON "course_subscriptions" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_source_path_url" ON "doc_urls" USING btree ("source_path","url");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_source_heading_chunk" ON "docs" USING btree ("source_path","heading","chunk");--> statement-breakpoint
CREATE UNIQUE INDEX "fav_key_points_user_lesson_key_point_idx" ON "fav_key_points" USING btree ("user_id","lesson_slug","key_point");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_material_progress_user_lesson_section_idx" ON "lesson_material_progress" USING btree ("user_id","lesson_slug","section_name");--> statement-breakpoint
CREATE INDEX "lesson_material_lesson_slug_idx" ON "lesson_material" USING btree ("lesson_slug");--> statement-breakpoint
CREATE INDEX "lesson_quiz_answers_user_id_idx" ON "lesson_quiz_answers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lesson_quiz_answers_user_lesson_idx" ON "lesson_quiz_answers" USING btree ("user_id","lesson_slug");--> statement-breakpoint
CREATE INDEX "module_depends_on_idx" ON "module_dependencies" USING btree ("depends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "org_lessons_org_lesson_idx" ON "organization_lessons" USING btree ("org_id","lesson_id");--> statement-breakpoint
CREATE INDEX "org_lessons_org_id_idx" ON "organization_lessons" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_lessons_lesson_id_idx" ON "organization_lessons" USING btree ("lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_news_sources_user_source_idx" ON "user_news_sources" USING btree ("user_id","news_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_orgs_user_org_idx" ON "user_organizations" USING btree ("user_id","org_id");--> statement-breakpoint
CREATE INDEX "upr_user_idx" ON "user_profile_roles" USING btree ("user_profile_id");--> statement-breakpoint
CREATE INDEX "upr_role_idx" ON "user_profile_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_profile_user_id_idx" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profile_call_sign_idx" ON "user_profiles" USING btree ("call_sign");--> statement-breakpoint
CREATE INDEX "user_profile_first_name_idx" ON "user_profiles" USING btree ("first_name");--> statement-breakpoint
CREATE INDEX "user_profile_last_name_idx" ON "user_profiles" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "user_profile_created_at_idx" ON "user_profiles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_roles_name_idx" ON "user_roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "videos_progress_user_id_idx" ON "videos_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "videos_progress_user_video_idx" ON "videos_progress" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "videos_progress_user_created_idx" ON "videos_progress" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_clientId_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_userId_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthApplication_userId_idx" ON "oauth_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthConsent_clientId_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthConsent_userId_idx" ON "oauth_consent" USING btree ("user_id");