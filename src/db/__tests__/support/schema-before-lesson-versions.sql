CREATE TABLE "account_deletion_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_deletion_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_deletion_requests_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "ai_chats" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text,
	"summarized_through_order" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "ai_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"parts" json NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "airports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "airports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"icao" varchar NOT NULL,
	"name" text NOT NULL,
	"lat" numeric(10, 5) NOT NULL,
	"lng" numeric(10, 5) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	CONSTRAINT "airports_icao_unique" UNIQUE("icao")
);

CREATE TABLE "associate_counters" (
	"yymm" varchar(4) PRIMARY KEY NOT NULL,
	"last_serial" integer NOT NULL,
	"seeded_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "blob_file_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blob_file_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"file_id" integer NOT NULL,
	"course_id" integer,
	"module_id" integer,
	"lesson_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "blob_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blob_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"url" varchar(500) NOT NULL,
	"size" integer NOT NULL,
	"type" varchar(100) NOT NULL,
	"uploadedBy" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_last_viewed" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_last_viewed_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"lesson_id" integer,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_modules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_modules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"rank" numeric(30, 15) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_onboarding_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_onboarding_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"onboarding_id" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"parts" jsonb NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_onboarding" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_onboarding_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_set_hash" varchar(64),
	"question_source" varchar(16),
	"consent_declined_at" timestamp,
	"deleted_at" timestamp,
	"machine_snapshot" jsonb,
	"machine_version" varchar(32),
	"onboarding_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_orgs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_orgs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"org_id" integer NOT NULL,
	"persona_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_remixes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_remixes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"source_course_id" integer NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_staff" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_staff_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"granted_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "course_video_providers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "course_video_providers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"provider" text NOT NULL,
	"secrets" jsonb NOT NULL,
	"last_validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "courses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "courses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url_avif" text,
	"image_url_webp" text,
	"onboarding_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"pass_mark" integer DEFAULT 85 NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "courses_pass_mark_check" CHECK ("courses"."pass_mark" between 0 and 100)
);

CREATE TABLE "debrief_answer_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "debrief_answer_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attempt_id" integer NOT NULL,
	"question_id" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "debrief_chunk_mastery" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "debrief_chunk_mastery_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_id" integer NOT NULL,
	"chunk_id" text NOT NULL,
	"latest_score" integer NOT NULL,
	"cleared_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "debrief_passes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "debrief_passes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" text NOT NULL,
	"passed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "discipline_modules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discipline_modules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"discipline_id" integer NOT NULL,
	"name" text NOT NULL,
	"rank" numeric(30, 15) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "discipline_staff" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discipline_staff_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"discipline_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "disciplines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "disciplines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "disciplines_slug_unique" UNIQUE("slug")
);

CREATE TABLE "doc_urls" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer,
	"source_path" text NOT NULL,
	"url" text,
	CONSTRAINT "uniq_course_source_path_url" UNIQUE NULLS NOT DISTINCT("course_id","source_path","url")
);

CREATE TABLE "docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer,
	"lesson_slug" text,
	"source_path" text NOT NULL,
	"heading" text,
	"chunk" text NOT NULL,
	"source" text DEFAULT '3d-airmanship' NOT NULL,
	"embedding" vector(3072) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_course_source_heading_chunk" UNIQUE NULLS NOT DISTINCT("course_id","source_path","heading","chunk"),
	CONSTRAINT "docs_source_check" CHECK ("docs"."source" in ('itps', '3d-airmanship'))
);

CREATE TABLE "fav_key_points" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fav_key_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" varchar(255),
	"key_point" text NOT NULL
);

CREATE TABLE "help_topics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "help_topics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"content" text NOT NULL,
	"rank" numeric(10, 5) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "help_topics_title_unique" UNIQUE("title")
);

CREATE TABLE "lesson_completions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_completions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_id" integer NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lesson_knowledge_chunks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_knowledge_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lesson_id" integer NOT NULL,
	"version" integer NOT NULL,
	"source_fingerprint" text NOT NULL,
	"chunks" jsonb NOT NULL,
	"previous_mapping" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lesson_material_progress" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_material_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" varchar(255) NOT NULL,
	"section_name" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "lesson_material" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_material_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lesson_slug" text NOT NULL,
	"text" text NOT NULL,
	"key_points" json,
	"quiz" json,
	"pro_tips" text,
	"links" json,
	"assignments" text,
	"job_of_the_day" text,
	"test_this" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "lesson_quiz_answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_quiz_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" varchar(255) NOT NULL,
	"answers" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "lesson_test_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lesson_test_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_slug" text NOT NULL,
	"questions" json NOT NULL,
	"answers" json DEFAULT '[]'::json NOT NULL,
	"total_score" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"format" text,
	"chunk_version" integer,
	"draft" jsonb,
	"finished_reason" text
);

CREATE TABLE "lessons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lessons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"other_video_ids" jsonb DEFAULT '[]'::jsonb,
	"video_provider" text,
	"video_ref" text,
	"required_subscriptions" text[] NOT NULL,
	"levels" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"exclusive_per_day" boolean DEFAULT false NOT NULL,
	"has_debrief" boolean DEFAULT true NOT NULL,
	"discipline_id" integer,
	"discipline_module_id" integer,
	"library_rank" numeric(30, 15),
	"org_id" integer NOT NULL,
	"needs_video_watch" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_slug_unique" UNIQUE("slug")
);

CREATE TABLE "module_dependencies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "module_dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"module_id" integer NOT NULL,
	"depends_on" text[] NOT NULL,
	CONSTRAINT "module_dependencies_module_id_unique" UNIQUE("module_id")
);

CREATE TABLE "module_lessons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "module_lessons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"module_id" integer NOT NULL,
	"lesson_id" integer NOT NULL,
	"rank" numeric(30, 15) NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "modules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "modules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"image_url_avif" text,
	"image_url_webp" text,
	"required_subscriptions" text[] NOT NULL,
	"sequential_lessons" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "modules_slug_unique" UNIQUE("slug")
);

CREATE TABLE "news_articles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"news_source_id" integer NOT NULL,
	"canonical_url" text NOT NULL,
	"original_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"published_at" timestamp,
	"published_at_estimated" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"embedding" vector(3072),
	"dedupe_of_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "news_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"selectors" text[] DEFAULT '{}',
	"image_url_avif" text,
	"image_url_webp" text,
	"image_url" text,
	"tint_color" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_scraped_at" timestamp,
	"last_scrape_status" text,
	"last_scrape_message" text,
	"rank" numeric(30, 15) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "offering_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offering_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"offering_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"assigned_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "offerings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offerings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"course_id" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "organization_lessons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_lessons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"lesson_id" integer NOT NULL
);

CREATE TABLE "organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "pending_enrolments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pending_enrolments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar(100) NOT NULL,
	"course_id" integer NOT NULL,
	"added_by" varchar(255),
	"added_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp
);

CREATE TABLE "personas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"name" text NOT NULL,
	"content" jsonb NOT NULL,
	"draft_content" jsonb,
	"is_org_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "prepared_debriefs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prepared_debriefs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"lesson_slug" text NOT NULL,
	"test" json NOT NULL,
	"source_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "role_permissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "role_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role_id" integer NOT NULL,
	"entity" varchar(50) NOT NULL,
	"action" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_levels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_levels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text,
	"note" text,
	"changed_by" varchar(255),
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_news_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_news_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"news_source_id" integer NOT NULL
);

CREATE TABLE "user_organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_roles" varchar(255)[] DEFAULT '{}' NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"org_id" integer NOT NULL
);

CREATE TABLE "user_profile_roles" (
	"user_profile_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upr_pk" PRIMARY KEY("user_profile_id","role_id")
);

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

CREATE TABLE "user_roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_name_unique" UNIQUE("name")
);

CREATE TABLE "user_ska_profile" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_ska_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"course_id" integer NOT NULL,
	"skills" text,
	"knowledge" text,
	"attitude" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "video_calls" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"user_name" varchar(255),
	"chat_id" varchar(255) NOT NULL,
	"course_slug" varchar(255),
	"tavus_conversation_id" varchar(255) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"reserved_seconds" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"end_reason" varchar(16),
	"transcript_saved_at" timestamp with time zone
);

CREATE TABLE "video_captions" (
	"playback_id" text PRIMARY KEY NOT NULL,
	"asset_id" text,
	"track_id" text,
	"language_code" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "videos_progress" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "videos_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"lesson_id" integer NOT NULL,
	"progress" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "video_resume_positions" (
	"user_id" varchar(255) NOT NULL,
	"lesson_id" integer NOT NULL,
	"position_seconds" real NOT NULL,
	"duration_seconds" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_resume_positions_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);

CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);

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

CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scopes" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"consent_given" boolean NOT NULL
);

CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_chat_id_ai_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai_chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_file_id_blob_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."blob_files"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "blob_file_assignments" ADD CONSTRAINT "blob_file_assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_last_viewed" ADD CONSTRAINT "course_last_viewed_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_last_viewed" ADD CONSTRAINT "course_last_viewed_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_last_viewed" ADD CONSTRAINT "course_last_viewed_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_onboarding_messages" ADD CONSTRAINT "course_onboarding_messages_onboarding_id_course_onboarding_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."course_onboarding"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_onboarding" ADD CONSTRAINT "course_onboarding_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_onboarding" ADD CONSTRAINT "course_onboarding_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_orgs" ADD CONSTRAINT "course_orgs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_orgs" ADD CONSTRAINT "course_orgs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_orgs" ADD CONSTRAINT "course_orgs_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "course_remixes" ADD CONSTRAINT "course_remixes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_remixes" ADD CONSTRAINT "course_remixes_source_course_id_courses_id_fk" FOREIGN KEY ("source_course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_role_id_user_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."user_roles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "course_subscriptions" ADD CONSTRAINT "course_subscriptions_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_subscriptions" ADD CONSTRAINT "course_subscriptions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "course_video_providers" ADD CONSTRAINT "course_video_providers_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "debrief_answer_logs" ADD CONSTRAINT "debrief_answer_logs_attempt_id_lesson_test_results_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."lesson_test_results"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "debrief_chunk_mastery" ADD CONSTRAINT "debrief_chunk_mastery_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "debrief_chunk_mastery" ADD CONSTRAINT "debrief_chunk_mastery_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "debrief_passes" ADD CONSTRAINT "debrief_passes_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "debrief_passes" ADD CONSTRAINT "debrief_passes_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "discipline_modules" ADD CONSTRAINT "discipline_modules_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "discipline_staff" ADD CONSTRAINT "discipline_staff_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "discipline_staff" ADD CONSTRAINT "discipline_staff_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "discipline_staff" ADD CONSTRAINT "discipline_staff_role_id_user_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."user_roles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "doc_urls" ADD CONSTRAINT "doc_urls_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "docs" ADD CONSTRAINT "docs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "docs" ADD CONSTRAINT "docs_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fav_key_points" ADD CONSTRAINT "fav_key_points_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "fav_key_points" ADD CONSTRAINT "fav_key_points_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_knowledge_chunks" ADD CONSTRAINT "lesson_knowledge_chunks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_material_progress" ADD CONSTRAINT "lesson_material_progress_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_material_progress" ADD CONSTRAINT "lesson_material_progress_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_material" ADD CONSTRAINT "lesson_material_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_quiz_answers" ADD CONSTRAINT "lesson_quiz_answers_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_quiz_answers" ADD CONSTRAINT "lesson_quiz_answers_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_test_results" ADD CONSTRAINT "lesson_test_results_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lesson_test_results" ADD CONSTRAINT "lesson_test_results_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_discipline_module_id_discipline_modules_id_fk" FOREIGN KEY ("discipline_module_id") REFERENCES "public"."discipline_modules"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "module_dependencies" ADD CONSTRAINT "module_dependencies_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "module_lessons" ADD CONSTRAINT "module_lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "module_lessons" ADD CONSTRAINT "module_lessons_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_news_source_id_news_sources_id_fk" FOREIGN KEY ("news_source_id") REFERENCES "public"."news_sources"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "offering_users" ADD CONSTRAINT "offering_users_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "offering_users" ADD CONSTRAINT "offering_users_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_lessons" ADD CONSTRAINT "organization_lessons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "organization_lessons" ADD CONSTRAINT "organization_lessons_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pending_enrolments" ADD CONSTRAINT "pending_enrolments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "personas" ADD CONSTRAINT "personas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "prepared_debriefs" ADD CONSTRAINT "prepared_debriefs_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "prepared_debriefs" ADD CONSTRAINT "prepared_debriefs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "prepared_debriefs" ADD CONSTRAINT "prepared_debriefs_lesson_slug_lessons_slug_fk" FOREIGN KEY ("lesson_slug") REFERENCES "public"."lessons"("slug") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_user_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."user_roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_news_sources" ADD CONSTRAINT "user_news_sources_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_news_sources" ADD CONSTRAINT "user_news_sources_news_source_id_news_sources_id_fk" FOREIGN KEY ("news_source_id") REFERENCES "public"."news_sources"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_profile_roles" ADD CONSTRAINT "user_profile_roles_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_profile_roles" ADD CONSTRAINT "user_profile_roles_role_id_user_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."user_roles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "user_ska_profile" ADD CONSTRAINT "user_ska_profile_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_ska_profile" ADD CONSTRAINT "user_ska_profile_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_chat_id_ai_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai_chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "videos_progress" ADD CONSTRAINT "videos_progress_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "videos_progress" ADD CONSTRAINT "videos_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "video_resume_positions" ADD CONSTRAINT "video_resume_positions_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "video_resume_positions" ADD CONSTRAINT "video_resume_positions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_application" ADD CONSTRAINT "oauth_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "chat_user_id_idx" ON "ai_chats" USING btree ("user_id");
CREATE INDEX "message_chat_id_idx" ON "ai_messages" USING btree ("chat_id");
CREATE INDEX "message_order_idx" ON "ai_messages" USING btree ("order");
CREATE INDEX "blob_file_assignments_file_id_idx" ON "blob_file_assignments" USING btree ("file_id");
CREATE INDEX "blob_file_assignments_course_id_idx" ON "blob_file_assignments" USING btree ("course_id");
CREATE INDEX "blob_file_assignments_module_id_idx" ON "blob_file_assignments" USING btree ("module_id");
CREATE INDEX "blob_file_assignments_lesson_id_idx" ON "blob_file_assignments" USING btree ("lesson_id");
CREATE INDEX "blob_files_uploaded_by_idx" ON "blob_files" USING btree ("uploadedBy");
CREATE INDEX "blob_files_created_at_idx" ON "blob_files" USING btree ("created_at");
CREATE INDEX "blob_files_url_idx" ON "blob_files" USING btree ("url");
CREATE UNIQUE INDEX "course_last_viewed_user_course_idx" ON "course_last_viewed" USING btree ("user_id","course_id");
CREATE UNIQUE INDEX "course_modules_course_module_idx" ON "course_modules" USING btree ("course_id","module_id");
CREATE INDEX "course_modules_course_id_idx" ON "course_modules" USING btree ("course_id");
CREATE INDEX "course_modules_module_id_idx" ON "course_modules" USING btree ("module_id");
CREATE UNIQUE INDEX "course_onboarding_messages_onboarding_order_idx" ON "course_onboarding_messages" USING btree ("onboarding_id","order");
CREATE INDEX "course_onboarding_messages_onboarding_id_idx" ON "course_onboarding_messages" USING btree ("onboarding_id");
CREATE UNIQUE INDEX "course_onboarding_user_course_idx" ON "course_onboarding" USING btree ("user_id","course_id");
CREATE INDEX "course_onboarding_course_id_idx" ON "course_onboarding" USING btree ("course_id");
CREATE UNIQUE INDEX "course_orgs_course_org_idx" ON "course_orgs" USING btree ("course_id","org_id");
CREATE INDEX "course_orgs_org_id_idx" ON "course_orgs" USING btree ("org_id");
CREATE INDEX "course_orgs_persona_id_idx" ON "course_orgs" USING btree ("persona_id");
CREATE UNIQUE INDEX "course_remixes_course_source_idx" ON "course_remixes" USING btree ("course_id","source_course_id");
CREATE INDEX "course_remixes_source_course_id_idx" ON "course_remixes" USING btree ("source_course_id");
CREATE UNIQUE INDEX "course_staff_user_course_role_idx" ON "course_staff" USING btree ("user_id","course_id","role_id");
CREATE INDEX "course_staff_user_course_idx" ON "course_staff" USING btree ("user_id","course_id");
CREATE INDEX "course_staff_course_idx" ON "course_staff" USING btree ("course_id");
CREATE UNIQUE INDEX "course_subscriptions_user_course_idx" ON "course_subscriptions" USING btree ("user_id","course_id");
CREATE UNIQUE INDEX "course_video_providers_course_provider_idx" ON "course_video_providers" USING btree ("course_id","provider");
CREATE UNIQUE INDEX "debrief_answer_logs_attempt_question_idx" ON "debrief_answer_logs" USING btree ("attempt_id","question_id");
CREATE UNIQUE INDEX "debrief_chunk_mastery_user_lesson_chunk_idx" ON "debrief_chunk_mastery" USING btree ("user_id","lesson_id","chunk_id");
CREATE UNIQUE INDEX "debrief_passes_user_lesson_idx" ON "debrief_passes" USING btree ("user_id","lesson_slug");
CREATE INDEX "discipline_modules_discipline_id_idx" ON "discipline_modules" USING btree ("discipline_id");
CREATE UNIQUE INDEX "discipline_staff_user_discipline_role_idx" ON "discipline_staff" USING btree ("user_id","discipline_id","role_id");
CREATE INDEX "discipline_staff_user_discipline_idx" ON "discipline_staff" USING btree ("user_id","discipline_id");
CREATE INDEX "discipline_staff_discipline_idx" ON "discipline_staff" USING btree ("discipline_id");
CREATE INDEX "docs_course_id_idx" ON "docs" USING btree ("course_id");
CREATE INDEX "docs_lesson_slug_idx" ON "docs" USING btree ("lesson_slug");
CREATE UNIQUE INDEX "fav_key_points_user_lesson_key_point_idx" ON "fav_key_points" USING btree ("user_id","lesson_slug","key_point");
CREATE UNIQUE INDEX "lesson_completions_user_lesson_idx" ON "lesson_completions" USING btree ("user_id","lesson_id");
CREATE UNIQUE INDEX "lesson_knowledge_chunks_lesson_idx" ON "lesson_knowledge_chunks" USING btree ("lesson_id");
CREATE UNIQUE INDEX "lesson_material_progress_user_lesson_section_idx" ON "lesson_material_progress" USING btree ("user_id","lesson_slug","section_name");
CREATE INDEX "lesson_material_lesson_slug_idx" ON "lesson_material" USING btree ("lesson_slug");
CREATE INDEX "lesson_quiz_answers_user_id_idx" ON "lesson_quiz_answers" USING btree ("user_id");
CREATE INDEX "lesson_quiz_answers_user_lesson_idx" ON "lesson_quiz_answers" USING btree ("user_id","lesson_slug");
CREATE INDEX "lesson_test_results_user_id_idx" ON "lesson_test_results" USING btree ("user_id");
CREATE INDEX "lesson_test_results_user_lesson_idx" ON "lesson_test_results" USING btree ("user_id","lesson_slug");
CREATE INDEX "lesson_test_results_user_lesson_completed_idx" ON "lesson_test_results" USING btree ("user_id","lesson_slug","completed_at");
CREATE UNIQUE INDEX "lesson_test_results_one_open_attempt_idx" ON "lesson_test_results" USING btree ("user_id","lesson_slug") WHERE "lesson_test_results"."completed_at" is null and "lesson_test_results"."format" = 'knowledge-chunks-v1';
CREATE INDEX "lessons_discipline_module_id_idx" ON "lessons" USING btree ("discipline_module_id");
CREATE INDEX "module_depends_on_idx" ON "module_dependencies" USING btree ("depends_on");
CREATE UNIQUE INDEX "module_lessons_module_lesson_idx" ON "module_lessons" USING btree ("module_id","lesson_id");
CREATE INDEX "module_lessons_module_id_idx" ON "module_lessons" USING btree ("module_id");
CREATE INDEX "module_lessons_lesson_id_idx" ON "module_lessons" USING btree ("lesson_id");
CREATE INDEX "module_lessons_depends_on_idx" ON "module_lessons" USING gin ("depends_on");
CREATE UNIQUE INDEX "news_articles_course_url_idx" ON "news_articles" USING btree ("course_id","canonical_url");
CREATE INDEX "news_articles_course_published_idx" ON "news_articles" USING btree ("course_id","published_at" DESC NULLS LAST);
CREATE INDEX "news_articles_first_seen_idx" ON "news_articles" USING btree ("first_seen_at");
CREATE UNIQUE INDEX "news_sources_course_url_idx" ON "news_sources" USING btree ("course_id","url");
CREATE INDEX "news_sources_course_id_idx" ON "news_sources" USING btree ("course_id");
CREATE UNIQUE INDEX "offering_users_offering_user_idx" ON "offering_users" USING btree ("offering_id","user_id");
CREATE INDEX "offering_users_offering_id_idx" ON "offering_users" USING btree ("offering_id");
CREATE INDEX "offering_users_user_id_idx" ON "offering_users" USING btree ("user_id");
CREATE INDEX "offerings_course_id_idx" ON "offerings" USING btree ("course_id");
CREATE INDEX "offerings_starts_on_idx" ON "offerings" USING btree ("starts_on");
CREATE UNIQUE INDEX "org_lessons_org_lesson_idx" ON "organization_lessons" USING btree ("org_id","lesson_id");
CREATE INDEX "org_lessons_org_id_idx" ON "organization_lessons" USING btree ("org_id");
CREATE INDEX "org_lessons_lesson_id_idx" ON "organization_lessons" USING btree ("lesson_id");
CREATE UNIQUE INDEX "pending_enrolments_email_course_idx" ON "pending_enrolments" USING btree ("email","course_id");
CREATE INDEX "pending_enrolments_email_idx" ON "pending_enrolments" USING btree ("email");
CREATE UNIQUE INDEX "personas_org_name_idx" ON "personas" USING btree ("org_id","name");
CREATE INDEX "personas_org_id_idx" ON "personas" USING btree ("org_id");
CREATE UNIQUE INDEX "personas_org_default_idx" ON "personas" USING btree ("org_id") WHERE "personas"."is_org_default";
CREATE UNIQUE INDEX "prepared_debriefs_user_course_lesson_idx" ON "prepared_debriefs" USING btree ("user_id","course_id","lesson_slug");
CREATE UNIQUE INDEX "role_permissions_role_entity_action_idx" ON "role_permissions" USING btree ("role_id","entity","action");
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");
CREATE INDEX "user_levels_lookup_idx" ON "user_levels" USING btree ("user_id","course_id","created_at" desc);
CREATE UNIQUE INDEX "user_levels_earned_once_idx" ON "user_levels" USING btree ("user_id","course_id","level") WHERE "user_levels"."source" = 'earned';
CREATE UNIQUE INDEX "user_news_sources_user_source_idx" ON "user_news_sources" USING btree ("user_id","news_source_id");
CREATE UNIQUE INDEX "user_orgs_user_org_idx" ON "user_organizations" USING btree ("user_id","org_id");
CREATE INDEX "upr_user_idx" ON "user_profile_roles" USING btree ("user_profile_id");
CREATE INDEX "upr_role_idx" ON "user_profile_roles" USING btree ("role_id");
CREATE INDEX "user_profile_user_id_idx" ON "user_profiles" USING btree ("user_id");
CREATE INDEX "user_profile_call_sign_idx" ON "user_profiles" USING btree ("call_sign");
CREATE INDEX "user_profile_first_name_idx" ON "user_profiles" USING btree ("first_name");
CREATE INDEX "user_profile_last_name_idx" ON "user_profiles" USING btree ("last_name");
CREATE INDEX "user_profile_created_at_idx" ON "user_profiles" USING btree ("created_at");
CREATE INDEX "user_roles_name_idx" ON "user_roles" USING btree ("name");
CREATE UNIQUE INDEX "user_ska_profile_user_course_idx" ON "user_ska_profile" USING btree ("user_id","course_id");
CREATE INDEX "user_ska_profile_user_updated_idx" ON "user_ska_profile" USING btree ("user_id","updated_at");
CREATE UNIQUE INDEX "video_calls_tavus_conversation_idx" ON "video_calls" USING btree ("tavus_conversation_id");
CREATE UNIQUE INDEX "video_calls_one_active_per_user_idx" ON "video_calls" USING btree ("user_id") WHERE "video_calls"."status" = 'active';
CREATE INDEX "video_calls_user_started_idx" ON "video_calls" USING btree ("user_id","started_at");
CREATE INDEX "videos_progress_user_id_idx" ON "videos_progress" USING btree ("user_id");
CREATE INDEX "videos_progress_user_lesson_idx" ON "videos_progress" USING btree ("user_id","lesson_id");
CREATE INDEX "videos_progress_user_created_idx" ON "videos_progress" USING btree ("user_id","created_at");
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");
CREATE INDEX "oauthAccessToken_clientId_idx" ON "oauth_access_token" USING btree ("client_id");
CREATE INDEX "oauthAccessToken_userId_idx" ON "oauth_access_token" USING btree ("user_id");
CREATE INDEX "oauthApplication_userId_idx" ON "oauth_application" USING btree ("user_id");
CREATE INDEX "oauthConsent_clientId_idx" ON "oauth_consent" USING btree ("client_id");
CREATE INDEX "oauthConsent_userId_idx" ON "oauth_consent" USING btree ("user_id");
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
