// Inlined from the old airmanship-web repo's `@/types` (metar-taf.com API
// response shapes). Ported verbatim except for formatting — these describe
// the third-party JSON payloads, not our own domain model, so they stay
// close to the wire format rather than being "cleaned up".
import { z } from 'zod';

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
  runway_condition: z.array(z.unknown()),
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

export const ApiResponseErrorSchema = z.object({
  status: z.literal(false),
  message: z.string(),
});

export const METARApiResponseSuccessSchema = z.object({
  status: z.literal(true),
  credits: z.number(),
  airport: AirportSchema,
  metar: MetarSchema,
  runways: z.array(RunwaySchema),
  stations: z.array(StationSchema),
});

export const METARApiResponseSchema = z.union([
  METARApiResponseSuccessSchema,
  ApiResponseErrorSchema,
]);

export type METARApiResponse = z.infer<typeof METARApiResponseSchema>;

/**
 * TAF hours have lots of "sometimes" fields depending on PROB/TEMPO/BECMG etc.
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
export type TAFApiSuccessResponse = z.infer<
  typeof TAFApiResponseSuccessSchema
>;

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

// ---- Domain shapes built on top of the wire types above ----

export type LatLng = { lat?: number; lng?: number };

export type FlyInputs = LatLng & {
  icao?: string;
  includeRaw?: boolean;
};

/**
 * Nearest METAR station data, normalized from `METARApiResponse`.
 * NOTE: this mirrors what `getMETAR` actually returns in flyability.ts, not
 * the old repo's dead/unused `MetarTafNearest` type (which included fields
 * like `distance_km` that were never populated). See task-5-report.md.
 */
export type MetarTafNearest = {
  icao: string;
  stationName: string;
  observedISO: string;
  visibility_m: number;
  ceiling_ft_agl?: number;
  wind_speed_ms: number;
  wind_gust_ms?: number;
  raw_text: string;
  weatherImage: string;
};

/**
 * Shape returned by `getNorthAmericaFlyData` and consumed by `flyDataToHtml`.
 * `taf` is the narrowed success variant of `TAFApiResponse` (never the
 * `status: false` error branch — `getTAF` returns `null` on error instead).
 */
export type FlyData = {
  metar: MetarTafNearest | null;
  taf: TAFApiSuccessResponse | null;
};
