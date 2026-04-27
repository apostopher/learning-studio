import { env } from "@/env";
import { cacheWithRedis } from "@/integrations/upstash/redis";
import {
  VideoResponseSchema,
  type VideoResponse,
  type VideosPage,
  VideosPageSchema,
  isVideoAvailable,
} from "@/types";

export async function getVideoDetails(videoId: string) {
  const response = await fetch(
    `https://api.synthesia.io/v2/videos/${videoId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: env.SYNTHESIA_API_KEY,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error("GET_VIDEO_URL_ERROR");
  }
  const data = await response.json();
  return VideoResponseSchema.parse(data);
}

export const getVideoDetailsWithCache = cacheWithRedis<string, VideoResponse>(
  "video-details",
  getVideoDetails,
  (result) => {
    if (isVideoAvailable(result)) {
      if (!result.download) return null;
      return getVideoExpiry(result.download);
    }
    return null;
  },
);

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
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: env.SYNTHESIA_API_KEY,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error("GET_VIDEOS_PAGE_ERROR");
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
>("all-videos", getAllVideos, (videos) => {
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
 * Extracts the Expires parameter from a video URL as a number.
 * @param videoURL The video URL containing the Expires query parameter.
 * @returns The Expires value as a number, or null if not found/invalid.
 */
export function getVideoExpiry(videoURL: string): number | null {
  try {
    const url = new URL(videoURL);
    const expires = url.searchParams.get("Expires");
    if (!expires) return null;
    const expiresNum = Number(expires);
    // give 1 minute buffer
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
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts.length > 0 ? pathParts[0] : null;
  } catch {
    return null; // Invalid URL
  }
}
