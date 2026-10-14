import { labelForLang, type VideoLang } from '#/lib/video-languages';

/** Languages Mux can generate captions in, of the ones lessons use. */
export type MuxCaptionCode = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'tr';

export type CaptionStatus = 'generating' | 'ready' | 'failed' | 'unsupported';

/** One `video_captions` row: a Mux playback id's caption state. */
export interface VideoCaptionsRow {
  playbackId: string;
  assetId: string | null;
  trackId: string | null;
  languageCode: string;
  status: CaptionStatus;
  error: string | null;
  checkedAt: Date;
}

/** The slice of a Mux asset track this module reads. */
export interface MuxTrack {
  id?: string;
  type?: string;
  status?: string;
  language_code?: string;
  text_source?: string;
}

// Mux generates captions in the audio's language and never translates, so a
// video's caption language IS its spoken language. `null`: Mux has no model
// for it — the row records `unsupported` and Mux is never called.
const MUX_CAPTION_CODES: Record<VideoLang, MuxCaptionCode | null> = {
  en: 'en',
  fr: 'fr',
  'fr-CA': 'fr',
  es: 'es',
  de: 'de',
  'pt-BR': 'pt',
  tr: 'tr', // Mux beta
  ja: null,
  zh: null,
  af: null,
  ar: null,
  hi: null,
};

export const muxCaptionLanguage = (lang: VideoLang): MuxCaptionCode | null =>
  MUX_CAPTION_CODES[lang];

const baseLanguage = (code: string | undefined) => code?.split('-')[0];

const textTracksIn = (tracks: readonly MuxTrack[], code: MuxCaptionCode) =>
  tracks.filter(
    (t) => t.type === 'text' && t.id && baseLanguage(t.language_code) === code,
  );

/**
 * The text track to use for `code`: a ready one first (generated or uploaded
 * — an existing track is reused rather than generating a duplicate), else
 * one still preparing. Errored and deleted tracks never count.
 */
export function pickCaptionTrack(
  tracks: readonly MuxTrack[],
  code: MuxCaptionCode,
): { trackId: string; status: 'ready' | 'generating' } | null {
  const candidates = textTracksIn(tracks, code);
  const ready = candidates.find((t) => t.status === 'ready');
  if (ready?.id) return { trackId: ready.id, status: 'ready' };
  const preparing = candidates.find((t) => t.status === 'preparing');
  if (preparing?.id) return { trackId: preparing.id, status: 'generating' };
  return null;
}

/** The audio track `generate-subtitles` runs on. */
export function findAudioTrackId(tracks: readonly MuxTrack[]): string | null {
  const audio = tracks.filter((t) => t.type === 'audio' && t.id);
  return (audio.find((t) => t.status === 'ready') ?? audio[0])?.id ?? null;
}

/** Where a stored generating track is now. Vanished, errored or deleted: failed. */
export function trackOutcome(
  tracks: readonly MuxTrack[],
  trackId: string,
): 'ready' | 'generating' | 'failed' {
  const track = tracks.find((t) => t.id === trackId);
  if (track?.status === 'ready') return 'ready';
  if (track?.status === 'preparing') return 'generating';
  return 'failed';
}

export const CAPTION_REFRESH_INTERVAL_MS = 60_000;

/** Ask Mux again only for a generating row, with a token, at most once a minute. */
export function shouldRefreshCaptions(
  row: VideoCaptionsRow,
  now: Date,
  hasToken: boolean,
): boolean {
  return (
    hasToken &&
    row.status === 'generating' &&
    row.assetId !== null &&
    now.getTime() - row.checkedAt.getTime() >= CAPTION_REFRESH_INTERVAL_MS
  );
}

/** Signed playback: the text track takes the same `v`-audience token as the stream. */
export const captionsVttUrl = (
  playbackId: string,
  trackId: string,
  token: string,
): string =>
  `https://stream.mux.com/${playbackId}/text/${trackId}.vtt?token=${token}`;

export const CAPTIONS_PENDING_CACHE_SECONDS = 60;

/**
 * Learner playback cache TTL: 30s under the signed URL's expiry (a URL handed
 * out as its entry expires must still play long enough to start), and no
 * more than a minute while captions are generating — otherwise CC and the
 * debrief would wait up to an hour behind a cached `captions: null`.
 */
export function playbackCacheTtl(
  expiresInSeconds: number,
  captionsPending: boolean,
): number {
  const bySignature = Math.max(1, expiresInSeconds - 30);
  return captionsPending
    ? Math.min(bySignature, CAPTIONS_PENDING_CACHE_SECONDS)
    : bySignature;
}

/**
 * Mux's own words from an SDK APIError's parsed body
 * (`{ error: { messages: [...] } }`), or null when it carries none.
 */
function muxBodyMessages(error: unknown): string | null {
  const messages = (error as { error?: { error?: { messages?: unknown } } })
    ?.error?.error?.messages;
  if (!Array.isArray(messages)) return null;
  const words = messages.filter((m): m is string => typeof m === 'string');
  return words.length > 0 ? words.join(' ') : null;
}

/** A Mux API failure in words an admin can act on. */
export function describeMuxError(error: unknown): string {
  const { status, message } = (error ?? {}) as {
    status?: unknown;
    message?: unknown;
  };
  if (status === 401 || status === 403) return 'Mux rejected the API token.';
  // The SDK's message is "<status> <raw JSON>"; prefer Mux's own sentences.
  const text =
    muxBodyMessages(error) ??
    (typeof message === 'string' ? message : String(error));
  if (/7 days/i.test(text)) {
    return 'Mux only captions videos older than 7 days on request — contact Mux support.';
  }
  return `Mux couldn't generate captions: ${text}`;
}

/** The generated track's name in Mux: "French (generated)". */
export const captionTrackName = (lang: VideoLang): string =>
  `${labelForLang(lang)} (generated)`;

/** What playback needs to know about a Mux video's captions (see `resolvePlayback`). */
export type MuxCaptionsLookup =
  | { status: 'ready'; trackId: string }
  | { status: 'pending' }
  | null;
