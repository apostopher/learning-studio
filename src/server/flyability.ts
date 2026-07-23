// Ported from airmanship-web's src/server/flyability.ts (metar-taf.com
// client). Adaptations from the original:
//  - `env.METARTAF_API_KEY` / `env.METARTAF_API_VERSION` (old typed env) ->
//    `process.env.METARTAF_API_KEY` / `process.env.METARTAF_API_VERSION`.
//    This file is intentionally NOT added to src/env.ts (off-limits).
//  - Wire-format types (METARApiResponse/TAFApiResponse/AirportsApiResponse)
//    moved inline into ./flyability-types.ts.
//  - Dropped the dead Tomorrow.io timeline adapter (`getTomorrowTimeline`,
//    `HourlyPoint`, `TomorrowTimeline`): it was never wired into
//    `getNorthAmericaFlyData` or `flyDataToHtml` in the old file, and its
//    env var (`TOMORROW_IO_API_KEY`) is out of scope for this task.
//  - Dropped Next.js-specific `next: { revalidate }` fetch options (this app
//    is not Next.js; the option isn't part of the standard `RequestInit`
//    type and would fail `tsc --noEmit`).
//  - Added `isFlyabilityConfigured()`.
import type {
  AirportsApiResponse,
  FlyData,
  FlyInputs,
  LatLng,
  METARApiResponse,
  MetarTafNearest,
  TAFApiResponse,
  TAFApiSuccessResponse,
} from '#/server/flyability-types';

const METARTAF_METAR_URL = 'https://api.metar-taf.com/metar';
const METARTAF_TAF_URL = 'https://api.metar-taf.com/taf';
const METARTAF_AIRPORTS_URL = 'https://api.metar-taf.com/airports';

export function isFlyabilityConfigured(): boolean {
  return !!process.env.METARTAF_API_KEY;
}

function requireApiKey(): string {
  const apiKey = process.env.METARTAF_API_KEY;
  if (!apiKey) throw new Error('METARTAF_API_KEY is not configured');
  return apiKey;
}

function apiVersion(): string {
  return process.env.METARTAF_API_VERSION ?? '1';
}

// ---- small utility: fetch with timeout + retries ----
async function fetchJSON<T>(
  input: RequestInfo,
  init: RequestInit & {
    timeoutMs?: number;
    retries?: number;
    retryOn?: number[];
  } = {},
): Promise<T> {
  const {
    timeoutMs = 7000,
    retries = 1,
    retryOn = [408, 429, 500, 502, 503, 504],
    ...rest
  } = init;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, {
      ...rest,
      signal: controller.signal,
    });
    if (!res.ok) {
      if (retries > 0 && retryOn.includes(res.status)) {
        // jittered backoff
        const wait = 300 + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, wait));
        return fetchJSON<T>(input, { ...init, retries: retries - 1 });
      }
      const text = await res.text().catch(() => '');
      throw new Error(
        `HTTP ${res.status} ${res.statusText} — ${text?.slice(0, 240)}`,
      );
    }
    return (await res.json()) as T;
  } catch (err: unknown) {
    if (
      retries > 0 &&
      err instanceof Error &&
      (err.name === 'AbortError' || /network/i.test(String(err)))
    ) {
      const wait = 400 + Math.floor(Math.random() * 600);
      await new Promise((r) => setTimeout(r, wait));
      return fetchJSON<T>(input, { ...init, retries: retries - 1 });
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// ---- Metar-Taf.com adapter (nearest by lat/lon; GET) ----
// Public docs indicate you can pass lat/lon to resolve nearest station.
// https://metar-taf.com/docs (see METAR & TAF reference pages)
async function getMETAR({
  lat,
  lng,
  icao,
}: LatLng & { icao?: string }): Promise<MetarTafNearest | null> {
  const apiKey = requireApiKey();

  // The service supports coords; station_id is optional and ignored when lat/lon are present.
  const url = new URL(METARTAF_METAR_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('v', apiVersion());

  if (icao) url.searchParams.set('id', icao);
  if (lat) url.searchParams.set('lat', String(lat));
  if (lng) url.searchParams.set('lon', String(lng));

  try {
    const json = await fetchJSON<METARApiResponse>(url.toString(), {
      timeoutMs: 6000,
      retries: 2,
    });

    if (!json.status) return null;

    // Prefer airport ICAO, fall back to station ICAO
    const stationIcao = json.airport.id;
    if (!stationIcao || !json.metar) return null;

    return {
      icao: stationIcao,
      stationName: json.airport.name,
      observedISO: new Date(json.metar.observed * 1000).toISOString(),
      visibility_m: json.metar.visibility,
      ceiling_ft_agl: json.metar.vertical_visibility ?? undefined, // in feet
      wind_speed_ms: json.metar.wind_speed, // in knots (field name kept from upstream)
      wind_gust_ms: json.metar.wind_gust ?? undefined,
      raw_text: json.metar.raw,
      weatherImage: json.metar.weather_image,
    };
  } catch (err) {
    // If Metar-Taf is down or quotaed, degrade gracefully.
    console.error(err);
    return null;
  }
}

export async function getTAF({
  icao,
}: {
  icao?: string;
}): Promise<TAFApiSuccessResponse | null> {
  const apiKey = requireApiKey();
  const url = new URL(METARTAF_TAF_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('v', apiVersion());

  if (icao) url.searchParams.set('id', icao);

  try {
    const json = await fetchJSON<TAFApiResponse>(url.toString(), {
      timeoutMs: 6000,
      retries: 2,
    });

    if (!json.status) return null;

    // Return the TAF data from successful response
    return json;
  } catch (err) {
    // If TAF service is down or quotaed, degrade gracefully
    console.error(err);
    return null;
  }
}

// ---- Public function: fetches nearest METAR + TAF in parallel ----
export async function getNorthAmericaFlyData(
  input: FlyInputs,
): Promise<FlyData> {
  // Run in parallel; allow either provider to fail without failing the whole call
  const [metar, taf] = await Promise.all([
    getMETAR(input).catch(() => null),
    getTAF(input).catch(() => null),
  ]);

  return { metar, taf };
}

async function getAirportsByPage(countryCode: string, pageId: number) {
  try {
    const url = new URL(METARTAF_AIRPORTS_URL);
    url.searchParams.set('api_key', requireApiKey());
    url.searchParams.set('v', apiVersion());
    url.searchParams.set('country_id', countryCode);
    url.searchParams.set('offset', String(pageId * 1000));
    const resp = await fetchJSON<AirportsApiResponse>(url.toString());
    if (!resp.status) {
      return {
        success: false as const,
        data: [],
      };
    }
    return {
      success: true as const,
      data: resp,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false as const,
      data: [],
    };
  }
}

export function getAirports(countryCode: string) {
  function getAirportsIterator() {
    let pageId = 1;
    return {
      next: async () => {
        const resp = await getAirportsByPage(countryCode, pageId);
        if (resp.success) {
          pageId += 1;
          return {
            done: resp.data.stats.results === 0,
            value: resp.data.airports,
          };
        }
        console.error(`Error fetching airports from ${countryCode} by page ${pageId}`);
        return {
          done: true,
          value: [],
        };
      },
    };
  }
  return {
    [Symbol.asyncIterator]: getAirportsIterator,
  };
}

// ---- HTML conversion for AI model consumption ----
export function flyDataToHtml(flyData: FlyData): string {
  const { taf, metar } = flyData;

  let html = '<div class="weather-data">';

  // Add drone-specific context header
  html += `
    <div class="drone-context">
      <h2>Drone Flight Weather Assessment</h2>
      <p><strong>Context:</strong> This weather data is being analyzed for drone flight safety. Key factors for drone operations include wind speed/gusts, visibility, ceiling height, precipitation, and thunderstorm probability.</p>
    </div>
  `;

  // Format METAR data (current conditions)
  if (metar) {
    html += `
      <div class="metar-section">
        <h3>Current Weather Conditions (METAR)</h3>
        <div class="station-info">
          <p><strong>Station:</strong> ${metar.icao} - ${metar.stationName || 'Unknown'}</p>
          <p><strong>Observed:</strong> ${
            metar.observedISO ? new Date(metar.observedISO).toLocaleString() : 'Unknown'
          }</p>
          <p><strong>Date/Time:</strong> ${
            metar.observedISO
              ? `${new Date(metar.observedISO).toLocaleDateString()} ${new Date(
                  metar.observedISO,
                ).toLocaleTimeString()}`
              : 'Unknown'
          }</p>
        </div>
        <div class="weather-conditions">
          <div class="wind-info">
            <h4>Wind Conditions</h4>
            <p><strong>Wind Speed:</strong> ${metar.wind_speed_ms || 'Unknown'} knots</p>
            ${
              metar.wind_gust_ms
                ? `<p><strong>Wind Gusts:</strong> ${metar.wind_gust_ms} knots</p>`
                : ''
            }
          </div>
          <div class="visibility-info">
            <h4>Visibility</h4>
            <p><strong>Visibility:</strong> ${
              metar.visibility_m ? `${metar.visibility_m} meters` : 'Unknown'
            }</p>
          </div>
          <div class="ceiling-info">
            <h4>Cloud Ceiling</h4>
            <p><strong>Ceiling:</strong> ${
              metar.ceiling_ft_agl ? `${metar.ceiling_ft_agl} feet AGL` : 'Unknown'
            }</p>
          </div>
        </div>
        ${
          metar.raw_text
            ? `
          <div class="raw-metar">
            <h4>Raw METAR</h4>
            <code>${metar.raw_text}</code>
          </div>
        `
            : ''
        }
      </div>
    `;
  } else {
    html += `
      <div class="metar-section">
        <h3>Current Weather Conditions (METAR)</h3>
        <p><em>No METAR data available</em></p>
      </div>
    `;
  }

  // Format TAF data (forecast)
  if (taf?.status) {
    const tafData = taf.taf;
    html += `
      <div class="taf-section">
        <h3>Weather Forecast (TAF)</h3>
        <div class="forecast-period">
          <p><strong>Forecast Period:</strong> ${new Date(
            tafData.starttime * 1000,
          ).toLocaleString()} to ${new Date(tafData.endtime * 1000).toLocaleString()}</p>
          <p><strong>Start Date/Time:</strong> ${new Date(
            tafData.starttime * 1000,
          ).toLocaleDateString()} ${new Date(tafData.starttime * 1000).toLocaleTimeString()}</p>
          <p><strong>End Date/Time:</strong> ${new Date(
            tafData.endtime * 1000,
          ).toLocaleDateString()} ${new Date(tafData.endtime * 1000).toLocaleTimeString()}</p>
        </div>
        <div class="forecast-hours">
          <h4>Hourly Forecast</h4>
          <div class="forecast-grid">
    `;

    for (const hour of tafData.hours) {
      const timeStr = new Date(hour.start * 1000).toLocaleString();
      const dateStr = new Date(hour.start * 1000).toLocaleDateString();
      const timeOnlyStr = new Date(hour.start * 1000).toLocaleTimeString();
      const isDay = hour.is_day ? 'Day' : 'Night';

      html += `
        <div class="forecast-hour">
          <h5>${timeStr} (${isDay})</h5>
          <div class="hour-datetime">
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Time:</strong> ${timeOnlyStr}</p>
          </div>
          <div class="hour-conditions">
            <p><strong>Code:</strong> ${hour.code} <span style="color: ${
              hour.code_color
            }">●</span></p>
            <p><strong>Report:</strong> ${hour.report}</p>
            ${
              hour.visibility
                ? `<p><strong>Visibility:</strong> ${hour.visibility}${
                    hour.visibility_sign || ''
                  }</p>`
                : ''
            }
            ${
              hour.wind_speed
                ? `<p><strong>Wind:</strong> ${hour.wind_speed} knots (direction: ${hour.wind_dir}°)</p>`
                : ''
            }
            ${hour.wind_gust ? `<p><strong>Wind Gusts:</strong> ${hour.wind_gust} knots</p>` : ''}
            ${
              hour.ceiling_tempo
                ? `<p><strong>Ceiling (Tempo):</strong> ${hour.ceiling_tempo} feet</p>`
                : ''
            }
            ${hour.tmin !== undefined ? `<p><strong>Min Temp:</strong> ${hour.tmin}°C</p>` : ''}
            ${hour.tmax !== undefined ? `<p><strong>Max Temp:</strong> ${hour.tmax}°C</p>` : ''}
          </div>
        </div>
      `;
    }

    html += `
          </div>
        </div>
        ${
          tafData.raw
            ? `
          <div class="raw-taf">
            <h4>Raw TAF</h4>
            <code>${tafData.raw}</code>
          </div>
        `
            : ''
        }
      </div>
    `;
  } else {
    html += `
      <div class="taf-section">
        <h3>Weather Forecast (TAF)</h3>
        <p><em>No TAF data available</em></p>
      </div>
    `;
  }

  // Add drone safety considerations
  html += `
    <div class="drone-safety-considerations">
      <h3>Drone Flight Safety Considerations</h3>
      <div class="safety-factors">
        <div class="wind-limits">
          <h4>Wind Limits</h4>
          <ul>
            <li><strong>Light Drones:</strong> Max 10-15 knots sustained, 20 knots gusts</li>
            <li><strong>Medium Drones:</strong> Max 15-20 knots sustained, 25 knots gusts</li>
            <li><strong>Heavy Drones:</strong> Max 20-25 knots sustained, 30 knots gusts</li>
          </ul>
        </div>
        <div class="visibility-requirements">
          <h4>Visibility Requirements</h4>
          <ul>
            <li><strong>Visual Line of Sight:</strong> Minimum 3 statute miles (4.8 km)</li>
            <li><strong>Part 107 Operations:</strong> Minimum 3 statute miles visibility</li>
            <li><strong>Beyond Visual Line of Sight:</strong> Special authorization required</li>
          </ul>
        </div>
        <div class="weather-restrictions">
          <h4>Weather Restrictions</h4>
          <ul>
            <li><strong>Precipitation:</strong> Avoid flying in rain, snow, or heavy precipitation</li>
            <li><strong>Thunderstorms:</strong> Never fly within 5 nautical miles of thunderstorms</li>
            <li><strong>Cloud Ceiling:</strong> Maintain 500 feet below clouds for Part 107 operations</li>
            <li><strong>Temperature:</strong> Consider battery performance in extreme temperatures</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  html += '</div>';

  return html;
}
