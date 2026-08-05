import { z } from 'zod';
import { env } from '#/env';
import { cacheWithRedis } from '#/integrations/upstash/redis';
import {
  isVideoAvailable,
  type VideoResponse,
  VideoResponseSchema,
} from '#/types';

/**
 * A non-OK response from the Synthesia API, carrying the status so callers can
 * tell a refused API key (401/403) from a missing video (404) from an outage.
 *
 * The message stays `GET_VIDEO_URL_ERROR` for continuity with existing callers
 * and log greps; the status is the part that's new.
 */
export class SynthesiaRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('GET_VIDEO_URL_ERROR');
    this.name = 'SynthesiaRequestError';
    this.status = status;
  }
}

export async function getVideoDetails(
  videoId: string,
  apiKey: string = env.SYNTHESIA_API_KEY,
) {
  const response = await fetch(
    `https://api.synthesia.io/v2/videos/${videoId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: apiKey,
      },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw new SynthesiaRequestError(response.status);
  }
  const data = await response.json();
  return VideoResponseSchema.parse(data);
}

/** Synthesia's list page size. Exported so callers can tell a full page (more
 *  may follow) from a short one (the sweep is done) without duplicating 100. */
export const SYNTHESIA_PAGE_SIZE = 100;

/**
 * The page envelope only. Videos stay `unknown` here so a single unrecognised
 * record cannot reject the other ninety-nine — see `parseVideosPage`.
 */
const videosPageEnvelopeSchema = z.object({
  nextOffset: z.number().optional(),
  videos: z.array(z.unknown()),
});

export interface SynthesiaVideosPage {
  /** The videos on this page that this app recognises. */
  videos: VideoResponse[];
  /**
   * Whether Synthesia returned a FULL page, so another may follow.
   *
   * Derived from the RAW entry count, before unrecognised records are
   * dropped. This is the whole reason it exists: a caller comparing
   * `videos.length` against the page size would read a full page with one
   * dropped record as a short page, decide the sweep was finished, and
   * silently skip every page after it.
   */
  hasMore: boolean;
}

/**
 * Parses a page, dropping records the schema cannot place rather than
 * rejecting the page.
 *
 * A page holds a hundred videos. Failing all of them because one has an
 * unexpected shape is not a hypothetical: Synthesia omits `captions` for some
 * finished videos, the union rejected them, and one such record cost an
 * entire course every one of its 83 lesson posters.
 *
 * The envelope itself is still strict — tolerance is for individual records,
 * not for "any JSON at all".
 */
function parseVideosPage(data: unknown): SynthesiaVideosPage {
  const envelope = videosPageEnvelopeSchema.parse(data);

  const videos: VideoResponse[] = [];
  for (const record of envelope.videos) {
    const parsed = VideoResponseSchema.safeParse(record);
    if (parsed.success) videos.push(parsed.data);
  }

  const dropped = envelope.videos.length - videos.length;
  if (dropped > 0) {
    // Loud, because a silent drop is how a shape change becomes a slow leak
    // of missing posters that nobody attributes to anything.
    console.warn(
      `Synthesia: dropped ${dropped} of ${envelope.videos.length} unrecognised video records`,
    );
  }

  return { videos, hasMore: envelope.videos.length >= SYNTHESIA_PAGE_SIZE };
}

/**
 * Fetches a page of videos from the Synthesia API.
 * @param page 1-based page number
 * @param apiKey Per-course credential. Defaults to the env key for the legacy
 *   single-account callers (`getAllVideos`); the admin board always passes the
 *   course's own key, because credentials are per-course everywhere else.
 */
export async function getVideosByPage(
  page: number,
  apiKey: string = env.SYNTHESIA_API_KEY,
): Promise<SynthesiaVideosPage> {
  const offset = (page - 1) * SYNTHESIA_PAGE_SIZE;
  const response = await fetch(
    `https://api.synthesia.io/v2/videos?limit=${SYNTHESIA_PAGE_SIZE}&offset=${offset}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: apiKey,
      },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw new Error('GET_VIDEOS_PAGE_ERROR');
  }
  const data = await response.json();
  return parseVideosPage(data);
}
/**
 * Returns an iterator that fetches videos by page.
 * @returns An iterator that fetches videos by page.
 */
function getVideosByPageIterator() {
  function videosIterator() {
    let pageId = 1;
    return {
      next: async () => {
        try {
          const resp = await getVideosByPage(pageId);
          // `hasMore` rather than `videos.length`: a full page whose records
          // were all unrecognised yields no videos but is NOT the end of the
          // account, and stopping there would truncate the sweep silently.
          if (resp.videos.length === 0 && !resp.hasMore) {
            return {
              done: true,
              value: null,
            };
          }
          pageId += 1;
          return {
            done: false,
            value: resp.videos,
          };
        } catch (error) {
          console.error(pageId, error);
          return {
            done: true,
            value: null,
          };
        }
      },
    };
  }
  return {
    [Symbol.asyncIterator]: videosIterator,
  };
}

/**
 * Fetches all videos from the Synthesia API.
 * @returns An array of all videos.
 */
export async function getAllVideos() {
  const iterator = getVideosByPageIterator();
  const videos: VideoResponse[] = [];
  for await (const pageVideos of iterator) {
    if (pageVideos) {
      videos.push(...pageVideos);
    }
  }
  return videos.reduce(
    (acc, video) => {
      if (isVideoAvailable(video)) {
        acc[video.id] = video;
      }
      return acc;
    },
    {} as Record<string, VideoResponse>,
  );
}

export const getAllVideosWithCache = cacheWithRedis<
  string,
  Record<string, VideoResponse>
>('all-videos', getAllVideos, (videos) => {
  const firstVideo = Object.values(videos).find((videoDetails) => {
    if (isVideoAvailable(videoDetails)) {
      return videoDetails.download;
    }
    return false;
  });
  if (!firstVideo || !isVideoAvailable(firstVideo)) {
    return null;
  }
  if (!firstVideo.download) return null;
  return getVideoExpiry(firstVideo.download);
});

/**
 * Seconds remaining until a pre-signed video URL's `Expires` stamp, i.e. a TTL
 * — used both as a Redis cache TTL and as `Playback.expiresInSeconds`.
 *
 * @param videoURL The video URL containing the Expires query parameter.
 * @returns Seconds remaining (may be negative if already past), or null if the
 * parameter is missing or unparseable. Callers that need a non-negative TTL
 * clamp it themselves.
 */
export function getVideoExpiry(videoURL: string): number | null {
  try {
    const url = new URL(videoURL);
    const expires = url.searchParams.get('Expires');
    if (!expires) return null;
    const expiresNum = Number(expires);
    if (!Number.isFinite(expiresNum)) return null;
    const ExpiresDate = new Date(expiresNum * 1000);
    const now = new Date();
    const diff = ExpiresDate.getTime() - now.getTime();
    return Math.floor(diff / 1000);
  } catch {
    return null;
  }
}

export function getVideoIdFromURL(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return pathParts.length > 0 ? pathParts[0] : null;
  } catch {
    return null; // Invalid URL
  }
}
