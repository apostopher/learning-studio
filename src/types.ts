import { z } from "zod";
import type { UIMessage } from "ai";

export const SubscriptionSchema = z.enum(["associate", "candidate", "rpoc"]);
export const SubscriptionsSchema = z.array(SubscriptionSchema);
export type SubscriptionType = z.infer<typeof SubscriptionSchema>;

// Video schemas
export const VideoAvailableSchema = z.object({
  id: z.string(),
  status: z.literal("complete"),
  download: z.url().nullable(),
  captions: z.object({
    srt: z.string().url().nullable(),
    vtt: z.string().url().nullable(),
  }),
  thumbnail: z.object({
    gif: z.string().url().nullable(),
    image: z.url().nullable(),
    optimized: z.record(z.string(), z.string()).nullable().optional(),
    thumbHash: z.string().optional(),
  }),
});

export const VideoNotReadySchema = z.object({
  id: z.string(),
  status: z.enum(["in_progress", "error", "rejected"]).nullable(),
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
  lang: z.enum(["FR", "JP"]),
  videoId: z.url("Video ID must be a valid URL"),
});
export type OtherVideoId = z.infer<typeof OtherVideoIdSchema>;

export const OtherVideoIdsSchema = z.array(OtherVideoIdSchema);
export type OtherVideoIds = z.infer<typeof OtherVideoIdsSchema>;

export const CourseLessonQuizOptionSchema = z.object({
  id: z.string(),
  value: z.string().describe("The value of the option in markdown format"),
});
export type CourseLessonQuizOption = z.infer<
  typeof CourseLessonQuizOptionSchema
>;

export const CourseLessonQuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string().describe("The question of the quiz in markdown format"),
  options: z.array(CourseLessonQuizOptionSchema),
  correctOptionId: z.string().describe("The id of the correct option"),
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

export const CourseLessonDependencySchema = z.object({
  moduleSlug: z
    .string()
    .optional()
    .describe(
      "The slug of the module. if not mentioned then its the current module",
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

export const CourseLessonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  videoId: z.string(),
  otherVideoIds: OtherVideoIdsSchema.nullable().default([]),
  videoDetails: VideoResponseSchema.optional(),
  requiredSubscriptions: z.array(SubscriptionSchema).optional(),
  dependsOn: z.array(CourseLessonDependencySchema).default([]),
  exclusivePerDay: z.boolean().optional(),
  organizations: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
      }),
    )
    .default([]),
});

export type CourseLesson = z.infer<typeof CourseLessonSchema>;

export const CourseLessonWithProgressSchema = CourseLessonSchema.extend({
  progressPercentage: z.number().optional(),
});
export type CourseLessonWithProgress = z.infer<
  typeof CourseLessonWithProgressSchema
>;

export const CourseModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  dependsOn: z.array(z.string()),
  lessons: z.array(CourseLessonSchema),
  requiredSubscriptions: z.array(SubscriptionSchema).optional(),
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const CourseModuleWithProgressSchema = CourseModuleSchema.extend({
  progressPercentage: z.number().optional(),
  lessons: z.array(CourseLessonWithProgressSchema),
});
export type CourseModuleWithProgress = z.infer<
  typeof CourseModuleWithProgressSchema
>;

export const CourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  modules: z.array(CourseModuleSchema),
});
export type Course = z.infer<typeof CourseSchema>;

export const UserPublicMetadataSchema = z.object({
  subscriptions: z.array(SubscriptionSchema).default(["associate"]),
  role: z.enum(["admin", "user"]).default("user"),
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
  title: z.string().nullable().default(""),
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

export type MessagePart = NonNullable<UIMessage["parts"]>[number];

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

export const VisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const ProfileItemVisibilitySchema = z.object({
  visibility: VisibilitySchema.default("PRIVATE"),
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
  type: z.enum(["one_time", "recurring"]),
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
  type: z.literal("data-request"),
  data: z.object({
    request: z.enum(["geolocation"]),
  }),
});
export type AIWriterDataRequest = z.infer<typeof AIWriterDataRequestSchema>;

export const AIWriterDataNotificationSchema = z.object({
  type: z.literal("data-notification"),
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
  type: z.literal("tool-checkFlyability"),
  state: z.literal("output-available"),
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
