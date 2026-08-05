import type { UIMessage } from 'ai';
import { z } from 'zod';

export const SubscriptionSchema = z.enum(['associate', 'candidate', 'rpoc']);
export const SubscriptionsSchema = z.array(SubscriptionSchema);
export type SubscriptionType = z.infer<typeof SubscriptionSchema>;

// Video schemas
export const VideoAvailableSchema = z.object({
  id: z.string(),
  status: z.literal('complete'),
  download: z.url().nullable(),
  /**
   * Absent entirely for some finished videos — Synthesia omits the key rather
   * than sending nulls, on both the list and the detail endpoint.
   *
   * Optional, not required-with-nulls, because requiring it made such a video
   * fail the `VideoAvailable | VideoNotReady` union: unparseable rather than
   * uncaptioned. On the detail endpoint that surfaced as VIDEO_NOT_AVAILABLE
   * (the video simply would not play); on the list endpoint one such entry
   * rejected the entire page of 100, costing every lesson in the course its
   * poster. Readers must treat absence as "no subtitles".
   */
  captions: z
    .object({
      srt: z.string().url().nullable(),
      vtt: z.string().url().nullable(),
    })
    .optional(),
  thumbnail: z.object({
    gif: z.string().url().nullable(),
    image: z.url().nullable(),
    optimized: z.record(z.string(), z.string()).nullable().optional(),
    thumbHash: z.string().optional(),
  }),
});

export const VideoNotReadySchema = z.object({
  id: z.string(),
  status: z.enum(['in_progress', 'error', 'rejected']).nullable(),
});

export const VideoResponseSchema = z.union([
  VideoAvailableSchema,
  VideoNotReadySchema,
]);
export type VideoResponse = z.infer<typeof VideoResponseSchema>;

export type VideoAvailable = z.infer<typeof VideoAvailableSchema>;
export type VideoNotReady = z.infer<typeof VideoNotReadySchema>;

export function isVideoAvailable(obj: unknown): obj is VideoAvailable {
  return VideoAvailableSchema.safeParse(obj).success;
}

export function isVideoNotReady(obj: unknown): obj is VideoNotReady {
  return VideoNotReadySchema.safeParse(obj).success;
}

export const VideosPageSchema = z.object({
  nextOffset: z.number().optional(),
  videos: z.array(VideoResponseSchema),
});
export type VideosPage = z.infer<typeof VideosPageSchema>;

export const OtherVideoIdSchema = z.object({
  lang: z.enum(['FR', 'JP']),
  videoId: z.url('Video ID must be a valid URL'),
});
export type OtherVideoId = z.infer<typeof OtherVideoIdSchema>;

export const OtherVideoIdsSchema = z.array(OtherVideoIdSchema);
export type OtherVideoIds = z.infer<typeof OtherVideoIdsSchema>;

export const OnboardingQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(2000),
});
export type OnboardingQuestion = z.infer<typeof OnboardingQuestionSchema>;

/** Total questions allowed across every category. Bounds the prompt, and
 * preserves the cap the flat schema enforced before categories existed. */
export const MAX_ONBOARDING_QUESTIONS = 50;
export const MAX_ONBOARDING_CATEGORIES = 12;

/**
 * A named group of questions. The agent uses category boundaries to signpost
 * moving between topics — see `src/ai/prompts/onboarding.ts`.
 *
 * Nesting (rather than a `category` field on each question) is deliberate: it
 * makes contiguity structural. An admin cannot author
 * `[techQ, motivationQ, techQ]`, so the agent can never introduce the same
 * category twice.
 */
export const OnboardingCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  questions: z.array(OnboardingQuestionSchema),
});
export type OnboardingCategory = z.infer<typeof OnboardingCategorySchema>;

/**
 * A course's onboarding question set: ordered categories, each with ordered
 * questions. Both levels are order-sensitive — the prompt states that the
 * given order is authoritative.
 *
 * The question cap is enforced across the whole set rather than per category,
 * so a course cannot dodge it by adding categories.
 */
export const OnboardingQuestionsSchema = z
  .array(OnboardingCategorySchema)
  .max(MAX_ONBOARDING_CATEGORIES)
  .refine(
    (categories) =>
      categories.reduce((sum, c) => sum + c.questions.length, 0) <=
      MAX_ONBOARDING_QUESTIONS,
    { message: `At most ${MAX_ONBOARDING_QUESTIONS} questions in total` },
  );
export type OnboardingQuestions = z.infer<typeof OnboardingQuestionsSchema>;

/**
 * A question paired with the category it came from — the shape the machine and
 * prompts consume.
 *
 * The runtime deliberately works off this FLAT list, not the nested one:
 * `pendingQuestions`, `selectNextQuestion`, the `answers` map and snapshot
 * resume all predate categories and keep working untouched. Nesting is a
 * storage and editor concern only.
 */
export type FlatOnboardingQuestion = OnboardingQuestion & {
  categoryId: string;
  categoryName: string;
};

/**
 * A user's onboarding answers, keyed by question id.
 *
 * The map itself is bounded, not just each answer: 128 chars is generous for
 * a UUID id; 500 entries bounds a row at roughly 2.5 MB while leaving an
 * order of magnitude of headroom over the 50-question cap for orphan answers
 * (deleted questions deliberately leave their answer behind — see
 * src/lib/course-onboarding.ts).
 */
export const OnboardingAnswersSchema = z
  .record(z.string().max(128), z.string().max(5000))
  .refine((answers) => Object.keys(answers).length <= 500, {
    message: 'Too many onboarding answers',
  });
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

/** The consent gate's decision. Nothing is asked until this returns consented. */
export const OnboardingConsentEvaluationSchema = z.object({
  status: z.enum(['consented', 'declined', 'needs_clarification']),
  reply: z.string().max(2000).nullable(),
});
export type OnboardingConsentEvaluation = z.infer<
  typeof OnboardingConsentEvaluationSchema
>;

/**
 * What a user's reply to an onboarding question means. `status` is the pivot
 * that turns free text into a state transition.
 *
 * The 5000-char cap on `answer` matches OnboardingAnswersSchema's per-answer
 * cap — an evaluation that could not be stored is not a valid evaluation.
 */
export const OnboardingReplyEvaluationSchema = z.object({
  status: z.enum([
    'answered',
    'needs_follow_up',
    'declined',
    'wants_pause',
    'wants_delete',
  ]),
  answer: z.string().max(5000).nullable(),
  followUp: z.string().max(2000).nullable(),
  hesitancy: z.boolean(),
});
export type OnboardingReplyEvaluation = z.infer<
  typeof OnboardingReplyEvaluationSchema
>;

export const CourseLessonQuizOptionSchema = z.object({
  id: z.string(),
  value: z.string().describe('The value of the option in markdown format'),
});
export type CourseLessonQuizOption = z.infer<
  typeof CourseLessonQuizOptionSchema
>;

export const CourseLessonQuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string().describe('The question of the quiz in markdown format'),
  options: z.array(CourseLessonQuizOptionSchema),
  correctOptionId: z.string().describe('The id of the correct option'),
});
export type CourseLessonQuizQuestion = z.infer<
  typeof CourseLessonQuizQuestionSchema
>;

export const CourseLessonQuizAnswerSchema =
  CourseLessonQuizQuestionSchema.extend({
    userOptionId: z.string().describe("The id of the user's answer").optional(),
  });

export type CourseLessonQuizAnswer = z.infer<
  typeof CourseLessonQuizAnswerSchema
>;

export const CourseLessonQuizAnswersSchema = z.array(
  CourseLessonQuizAnswerSchema,
);
export type CourseLessonQuizAnswers = z.infer<
  typeof CourseLessonQuizAnswersSchema
>;

export const CourseLessonQuizSchema = z.array(CourseLessonQuizQuestionSchema);
export type CourseLessonQuiz = z.infer<typeof CourseLessonQuizSchema>;

export const CourseLessonMaterialSchema = z.object({
  id: z.number(),
  text: z.string(),
  keyPoints: z.array(z.string()),
  proTips: z.string(),
  quiz: CourseLessonQuizSchema,
  links: z.array(z.string()).optional(),
  assignments: z.string().optional(),
  jobOfTheDay: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});
export type CourseLessonMaterial = z.infer<typeof CourseLessonMaterialSchema>;

/**
 * Shape the docx parser returns and the edit form uses — the canonical lesson
 * material minus the DB `id`. Prose fields are HTML; quiz question/option
 * values are markdown (see the quiz schema).
 */
export const LessonMaterialGenerationSchema = CourseLessonMaterialSchema.omit({
  id: true,
});
export type LessonMaterialGeneration = z.infer<
  typeof LessonMaterialGenerationSchema
>;

export const CourseLessonDependencySchema = z.object({
  moduleSlug: z
    .string()
    .optional()
    .describe(
      'The slug of the module. if not mentioned then its the current module',
    ),
  lessonSlug: z.string(),
});
export type CourseLessonDependency = z.infer<
  typeof CourseLessonDependencySchema
>;

export const CourseLessonDependenciesSchema = z.array(
  CourseLessonDependencySchema,
);
export type CourseLessonDependencies = z.infer<
  typeof CourseLessonDependenciesSchema
>;

export const UserPublicMetadataSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).default(['associate']),
  role: z.enum(['admin', 'user']).default('user'),
});
export type UserPublicMetadata = z.infer<typeof UserPublicMetadataSchema>;

export const ScraperErrorSchema = z.object({
  error: z.string(),
  type: z.string().optional(),
});
export type ScraperError = z.infer<typeof ScraperErrorSchema>;

export const ScraperErrorsSchema = z.array(ScraperErrorSchema);
export type ScraperErrors = z.infer<typeof ScraperErrorsSchema>;

export const ArticleSchema = z.object({
  source: z.string(),
  title: z.string(),
  url: z.string().optional(),
  description: z.string(),
  published_time: z.string(),
  image: z.string().optional(), // some pages may not expose og:image
});
export type Article = z.infer<typeof ArticleSchema>;

export const ArticlesSchema = z.object({
  articles: z.array(ArticleSchema),
});
export type Articles = z.infer<typeof ArticlesSchema>;

const LatestNewsSchema = z.object({
  sourceId: z.number(),
  title: z.string().nullable().default(''),
  image: z.string().nullable(),
  description: z.string().nullable(),
  linkURL: z.string().nullable(),
  publishedTime: z
    .string()
    .nullable()
    .transform((str) => (str ? new Date(str) : null)),
});
export type LatestNews = z.infer<typeof LatestNewsSchema>;

export const AllLatestNewsSchema = z.array(LatestNewsSchema);

/**
 * Outcome of one source's turn in the scrape cron.
 *
 * Every value except `ok` produces an empty or short feed for that source, and
 * they are indistinguishable to a reader — which is exactly why the reason is
 * stored rather than only logged.
 */
export const NEWS_SCRAPE_STATUSES = [
  'ok',
  'blocked_by_robots',
  'fetch_failed',
  'no_links_found',
  'no_dated_articles',
] as const;
export const NewsScrapeStatusSchema = z.enum(NEWS_SCRAPE_STATUSES);
export type NewsScrapeStatus = z.infer<typeof NewsScrapeStatusSchema>;

export const AddressSchema = z.object({
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
});

export type Address = z.infer<typeof AddressSchema>;

export const traceMetadataSchema = z.object({
  userName: z.string(),
  country: z.string().optional(),
  city: z.string().optional(),
});
export type TraceMetadata = z.infer<typeof traceMetadataSchema>;

export type MessagePart = NonNullable<UIMessage['parts']>[number];

export const RoomMessageSchema = z.object({
  text: z.string(),
});
export type RoomMessage = z.infer<typeof RoomMessageSchema>;

export const PilotLicenseSchema = z.object({
  id: z.string(),
  country: z.string(),
  type: z.array(z.string()),
});

export const PilotLicensesSchema = z.array(PilotLicenseSchema);
export type PilotLicenses = z.infer<typeof PilotLicensesSchema>;

export const VisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);

export const ProfileItemVisibilitySchema = z.object({
  visibility: VisibilitySchema.default('PRIVATE'),
  name: z.string(),
});

export const ProfileVisibilitySchema = z
  .array(ProfileItemVisibilitySchema)
  .default([]);
export type ProfileVisibility = z.infer<typeof ProfileVisibilitySchema>;

export const PersonaSchema = z.object({
  basicInfo: z.string(),
  mission: z.string(),
  goal: z.string(),
  communicationStyle: z.string(),
  quotes: z.array(z.string()),
  coreDirective: z.string(),
  howToAnswer: z.string(),
  noAnswerTemplate: z.string(),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const UserPreferencesSchema = z.object({
  profileVisibility: ProfileVisibilitySchema,
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const CandidateIDSchema = z.object({
  id: z.number(),
  prefix: z.string(),
  suffix: z.string().optional(),
});
export type CandidateID = z.infer<typeof CandidateIDSchema>;

export const ClerkErrorSchema = z.object({
  error: z.string(),
  details: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      longMessage: z.string(),
      meta: z.object({
        paramName: z.string(),
      }),
    }),
  ),
});

export type ClerkError = z.infer<typeof ClerkErrorSchema>;

export const PriceSchema = z.object({
  id: z.string(),
  unit_amount: z.number().nullable(),
  currency: z.string(),
  type: z.enum(['one_time', 'recurring']),
  interval: z.string().nullable().optional(),
  interval_count: z.number().nullable().optional(),
});

export const ProductWithPricesSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  images: z.array(z.string()),
  metadata: z.object({
    internalId: z.string().optional(),
    CTALabel: z.string().optional(),
  }),
  features: z
    .array(z.object({ name: z.string() }))
    .nullable()
    .optional(),
  prices: z.array(PriceSchema),
});

// Infer TypeScript types from Zod schemas
export type Price = z.infer<typeof PriceSchema>;
export type ProductWithPrices = z.infer<typeof ProductWithPricesSchema>;

export function isProductWithPricesArray(
  obj: unknown,
): obj is ProductWithPrices[] {
  return z.array(ProductWithPricesSchema).safeParse(obj).success;
}

export const AIWriterDataRequestSchema = z.object({
  type: z.literal('data-request'),
  data: z.object({
    request: z.enum(['geolocation']),
  }),
});
export type AIWriterDataRequest = z.infer<typeof AIWriterDataRequestSchema>;

export const AIWriterDataNotificationSchema = z.object({
  type: z.literal('data-notification'),
  data: z.object({
    text: z.string(),
  }),
});

export type AIWriterDataNotification = z.infer<
  typeof AIWriterDataNotificationSchema
>;

export const AIWriterDataSchema = z.union([
  AIWriterDataRequestSchema,
  AIWriterDataNotificationSchema,
]);
export type AIWriterData = z.infer<typeof AIWriterDataSchema>;

export const FlyabilityToolOutputSchema = z.object({
  type: z.literal('tool-checkFlyability'),
  state: z.literal('output-available'),
  output: z.object({
    text: z.string(),
    data: z.object({
      request: z.string().optional(),
    }),
  }),
});
export type FlyabilityToolOutput = z.infer<typeof FlyabilityToolOutputSchema>;

export const CloudSchema = z.object({
  id: z.number(),
  height: z.number(),
  report: z.string(),
  amount: z.string(),
});

export const MetarSchema = z.object({
  cavok: z.boolean(),
  ceiling: z.number().nullable(),
  ceiling_color: z.string(),
  clouds: z.array(CloudSchema),
  code: z.string(),
  code_color: z.string(),
  colour_state: z.string().nullable(),
  dewpoint: z.number(),
  dewpoint_exact: z.number().nullable(),
  humidity: z.number(),
  is_day: z.boolean(),
  observed: z.number(),
  qnh: z.number(),
  raw: z.string(),
  recent_weather_report: z.string().nullable(),
  remarks: z.string().nullable(),
  runway_condition: z.array(z.unknown()), // empty array in example
  runway_visibility: z.array(z.unknown()),
  snoclo: z.boolean(),
  station_id: z.string(),
  sunrise: z.number(),
  sunset: z.number(),
  temperature: z.number(),
  temperature_exact: z.number().nullable(),
  trends: z.array(z.unknown()),
  vertical_visibility: z.number().nullable(),
  visibility: z.number(),
  visibility_sign: z.string(),
  visibility_color: z.string(),
  visibility_min: z.number().nullable(),
  visibility_min_direction: z.unknown().nullable(),
  warnings: z.array(z.unknown()),
  weather: z.string(),
  weather_image: z.string(),
  weather_report: z.string().nullable(),
  wind_color: z.string(),
  wind_dir: z.number(),
  wind_dir_max: z.number(),
  wind_dir_min: z.number(),
  wind_gust: z.number().nullable(),
  wind_speed: z.number(),
  ws_all: z.unknown().nullable(),
  ws_runways: z.unknown().nullable(),
  id: z.number(),
});

export const AirportSchema = z.object({
  id: z.string(),
  iata: z.string(),
  name: z.string(),
  name_translated: z.string(),
  city_name: z.string(),
  admin1: z.string(),
  admin2: z.string(),
  country_id: z.string(),
  country_name: z.string(),
  lat: z.number(),
  lng: z.number(),
  metar: z.boolean(),
  taf: z.boolean(),
  timezone: z.number(),
  fir: z.string(),
  elevation: z.number(),
  type: z.number(),
  last_notam: z.number(),
});

export const RunwaySchema = z.object({
  id_l: z.string(),
  id_h: z.string(),
  hdg_l: z.number(),
  hdg_h: z.number(),
  in_use: z.number(),
  xwnd: z.number(),
  hwnd: z.number(),
});

export const StationSchema = z.object({
  id: z.string(),
  name: z.string(),
  taf: z.boolean(),
});

export const METARApiResponseSuccessSchema = z.object({
  status: z.literal(true),
  credits: z.number(),
  airport: AirportSchema,
  metar: MetarSchema,
  runways: z.array(RunwaySchema),
  stations: z.array(StationSchema),
});

export const ApiResponseErrorSchema = z.object({
  status: z.literal(false),
  message: z.string(),
});

export const METARApiResponseSchema = z.union([
  METARApiResponseSuccessSchema,
  ApiResponseErrorSchema,
]);

export type METARApiResponse = z.infer<typeof METARApiResponseSchema>;

/**
 * TAF hours have lots of “sometimes” fields depending on PROB/TEMPO/BECMG etc.
 * Make uncommon fields optional so a single schema will validate all items.
 */
export const TafHourSchema = z.object({
  code: z.string(), // e.g., "VFR"
  code_color: z.string(), // e.g., "#28a745"
  date: z.string(), // "friday", "saturday" (keep open as string)
  is_day: z.boolean(),
  report: z.string(),
  start: z.number(), // epoch seconds

  // Common but still keep flexible
  visibility: z.number().optional(),
  visibility_sign: z.string().optional(), // e.g., "P"
  weather_image: z.string().optional(), // e.g., "few"

  // Wind fields (various TAF groups)
  wind_dir: z.number(), // -1 sometimes (VRB)
  wind_speed: z.number().optional(),
  wind_gust: z.number().optional(),
  wind_speed_tempo: z.number().optional(),
  wind_gust_tempo: z.number().optional(),
  wind_speed_becmg: z.number().optional(),
  wind_gust_becmg: z.number().optional(),

  // Ceiling/tempo variants
  ceiling_tempo: z.number().optional(),

  // Daylight/temp extra fields that sometimes appear
  sunrise: z.number().optional(),
  sunset: z.number().optional(),
  tmin: z.number().optional(),
  tmax: z.number().optional(),
});

export const TafSchema = z.object({
  endtime: z.number(),
  hours: z.array(TafHourSchema),
  observed: z.number(),
  raw: z.string(),
  starttime: z.number(),
  station_id: z.string(),
});

export const TAFApiResponseSuccessSchema = z.object({
  airport: AirportSchema,
  credits: z.number(),
  stations: z.array(StationSchema),
  status: z.literal(true),
  taf: TafSchema,
});

export const TAFApiResponseSchema = z.union([
  TAFApiResponseSuccessSchema,
  ApiResponseErrorSchema,
]);

export type TAFApiResponse = z.infer<typeof TAFApiResponseSchema>;

export const LocationMetadataSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timestamp: z.string(),
});

const AirportDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export const AirportsApiSuccessResponseSchema = z.object({
  status: z.literal(true),
  stats: z.object({
    results: z.number(),
    from: z.number(),
    to: z.number(),
  }),
  airports: z.array(AirportDetailsSchema),
});

export const AirportsApiResponseSchema = z.union([
  AirportsApiSuccessResponseSchema,
  ApiResponseErrorSchema,
]);

export type AirportsApiResponse = z.infer<typeof AirportsApiResponseSchema>;
