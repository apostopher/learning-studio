// Ported from airmanship-web's src/ai/knowledge-base.ts `checkFlyability`
// tool block. Adaptations from the original:
//  - ICAO extraction is a pure regex helper (`extractIcaoFromText`) instead
//    of the old `extractICAOCode` -> `extractICAOCodeFromText`, which
//    validated candidates against a Drizzle `airportsTable` lookup. That
//    DB-backed validation is out of scope here; the brief specifies a plain
//    `/\b([A-Z]{4})\b/` match on the raw (uppercase-only) text.
//  - Coordinate/ICAO resolution is split into a pure `resolveLocation`
//    helper so it can be unit-tested without touching the network.

import type { ModelMessage, UIMessage } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';
import {
  flyDataToHtml,
  getNorthAmericaFlyData,
  isFlyabilityConfigured,
} from '#/server/flyability';
import { LocationMetadataSchema } from '#/types';

export const CheckFlyabilityInputSchema = z
  .object({
    lat: z
      .string()
      .optional()
      .describe(
        'the latitude of the location to check the flyability. This is optional.',
      ),
    lng: z
      .string()
      .optional()
      .describe(
        'the longitude of the location to check the flyability. This is optional.',
      ),
    icao: z
      .string()
      .optional()
      .describe(
        'the ICAO code (4 letters) of the airport to check the flyability. Look for 4-letter codes in the message like KATL, OMDB, CYEG, KLAX, KJFK, etc. This is optional but preferred when available.',
      ),
    // Accepted for parity with the old tool's input schema, but currently
    // unused: Task 5's `getNorthAmericaFlyData` has no datetime param.
    datetime: z
      .string()
      .optional()
      .describe('the date to check the flyability. This is optional.'),
  })
  .optional()
  .describe('the location to check the flyability. This is optional.');

export type CheckFlyabilityInput = z.infer<typeof CheckFlyabilityInputSchema>;

export const CheckFlyabilityOutputSchema = z.object({
  text: z.string().describe('the text to return to the user'),
  data: z
    .object({
      request: z
        .string()
        .optional()
        .describe('the request to make to the user'),
    })
    // Successful calls spread the full `FlyData` (metar/taf) into `data`,
    // which the old repo's schema never modeled either — `.loose()` keeps
    // that shape valid without re-declaring the metar-taf wire types here.
    .loose()
    .describe(
      'flyability data (metar/taf) when available, or a follow-up request',
    ),
});

export type CheckFlyabilityOutput = z.infer<typeof CheckFlyabilityOutputSchema>;

/**
 * Pulls a 4-letter uppercase ICAO airport code out of free text, e.g.
 * "can I fly at KJFK today?" -> "KJFK". Uppercase-only so it doesn't match
 * ordinary lowercase words.
 */
export function extractIcaoFromText(text: string): string | null {
  const match = text.match(/\b([A-Z]{4})\b/);
  return match ? match[1] : null;
}

function lastUserMessageText(messages: ModelMessage[]): string | undefined {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  if (!lastUserMessage) return undefined;

  const { content } = lastUserMessage;
  if (typeof content === 'string') return content;

  const textPart = content.find((part) => part.type === 'text');
  return textPart?.text;
}

export type ResolvedLocation =
  | { lat?: number; lng?: number; icao?: string }
  | { needsLocation: true };

/**
 * Decides what location info to pass to `getNorthAmericaFlyData`, given
 * whatever was already resolved (input `lat`/`lng`/`icao`) plus a
 * geolocation fallback read from the last UI message's `metadata`. Mirrors
 * the old tool's `(!lat || !lng) && !icao` gate: only fails closed
 * (`needsLocation: true`) when there's neither a usable ICAO nor a
 * complete lat/lng pair.
 */
export function resolveLocation(params: {
  lat?: string;
  lng?: string;
  icao?: string;
  uiMessages: UIMessage[];
}): ResolvedLocation {
  const { icao } = params;
  let { lat, lng } = params;

  if ((!lat || !lng) && !icao) {
    const lastUIMessage = params.uiMessages[params.uiMessages.length - 1];
    const locationMetadata = LocationMetadataSchema.safeParse(
      lastUIMessage?.metadata,
    );
    if (locationMetadata.success) {
      lat = String(locationMetadata.data.latitude);
      lng = String(locationMetadata.data.longitude);
    }
  }

  if ((!lat || !lng) && !icao) {
    return { needsLocation: true };
  }

  return {
    lat: lat !== undefined ? Number(lat) : undefined,
    lng: lng !== undefined ? Number(lng) : undefined,
    icao,
  };
}

export function makeCheckFlyabilityTool(opts: {
  messages: ModelMessage[];
  uiMessages: UIMessage[];
}) {
  const { messages, uiMessages } = opts;

  return tool({
    description:
      'The user may want to know whether they can fly in a given location on a given date and time based on weather and visibility. Use this tool to check the flyability. This tool returns the weather and visibility for the given area on the given datetime. Reply to the user based on the data returned from this tool. IMPORTANT: look for ICAO codes (4-letter airport codes like KATL, OMDB, CYEG) in the message and extract them automatically.',
    inputSchema: CheckFlyabilityInputSchema,
    outputSchema: CheckFlyabilityOutputSchema,
    execute: async (input) => {
      let { icao } = input ?? {};
      const { lat, lng } = input ?? {};

      if (!icao) {
        const lastText = lastUserMessageText(messages);
        icao = (lastText && extractIcaoFromText(lastText)) || undefined;
      }

      const resolved = resolveLocation({ lat, lng, icao, uiMessages });

      if ('needsLocation' in resolved) {
        return {
          text: "We need your location or an airport's ICAO code to check flyability. Please share your location or a 4-letter ICAO code.",
          data: { request: 'geolocation' },
        };
      }

      if (!isFlyabilityConfigured()) {
        return {
          text: 'Weather is not configured.',
          data: {},
        };
      }

      const flyData = await getNorthAmericaFlyData({
        lat: resolved.lat,
        lng: resolved.lng,
        icao: resolved.icao,
      });

      return {
        text: flyDataToHtml(flyData),
        data: { ...flyData },
      };
    },
  });
}
