// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isVideoAvailable, VideosPageSchema } from '../../types';

/**
 * Shape tests against what Synthesia actually returns.
 *
 * `thumbnails.test.ts` mocks `getVideosByPage` wholesale, so nothing there
 * ever validates a real page — which is exactly how this got to production.
 * One video in a live page of 100 had no `captions` field, the union in
 * `VideoResponseSchema` rejected it, `VideosPageSchema` rejected the WHOLE
 * page, and all 83 lessons in the course lost their posters.
 *
 * These pin the shapes so a mocked sweep can't hide the next one.
 */

/** A list entry with every field the schema reads. */
const completeVideo = {
  id: 'vid_1',
  status: 'complete' as const,
  download: 'https://cdn.synthesia.io/v.mp4',
  captions: { srt: null, vtt: null },
  thumbnail: { gif: null, image: 'https://cdn.synthesia.io/t.jpg' },
};

/**
 * Observed in production (video 9b82691c…): Synthesia omits `captions`
 * entirely for some finished videos, on the list AND the detail endpoint.
 */
const captionlessVideo = {
  id: 'vid_2',
  status: 'complete' as const,
  download: 'https://cdn.synthesia.io/v2.mp4',
  thumbnail: { gif: null, image: 'https://cdn.synthesia.io/t2.jpg' },
};

describe('Synthesia video response schemas', () => {
  it('treats a finished video with no captions field as available', () => {
    // Absent captions means "this video has no subtitles", not "this response
    // is unrecognisable". The latter reading made the video unplayable.
    expect(isVideoAvailable(captionlessVideo)).toBe(true);
  });

  it('keeps a whole page parseable when one entry has no captions', () => {
    const page = { videos: [completeVideo, captionlessVideo] };

    const parsed = VideosPageSchema.safeParse(page);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.videos).toHaveLength(2);
  });

  it('still rejects a video missing the fields the app actually needs', () => {
    // Making captions optional must not turn the schema into a rubber stamp:
    // `download` and `thumbnail` are what the poster and player read.
    expect(isVideoAvailable({ id: 'x', status: 'complete' })).toBe(false);
  });
});
