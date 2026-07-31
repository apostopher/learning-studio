import { env } from '@/env';
import { cacheWithRedis } from '@/integrations/upstash/redis';
import {
  isVideoAvailable,
  type VideoResponse,
  VideoResponseSchema,
  type VideosPage,
  VideosPageSchema,
} from '@/types';

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

/**
 * Fetches a page of videos from the Synthesia API.
 * @param page 1-based page number
 * @returns VideosPage object
 */
export async function getVideosByPage(page: number): Promise<VideosPage> {
  const limit = 100;
  const offset = (page - 1) * limit;
  const response = await fetch(
    `https://api.synthesia.io/v2/videos?limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: env.SYNTHESIA_API_KEY,
      },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw new Error('GET_VIDEOS_PAGE_ERROR');
  }
  const data = await response.json();
  return VideosPageSchema.parse(data);
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
          if (resp.videos.length === 0) {
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
