// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isVideoAvailable, VideoResponseSchema } from '../../types';

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

  it('places a captionless finished video in the union, not outside it', () => {
    // The union is what page parsing runs per record. Matching NEITHER arm is
    // what made one video reject its whole page — and, on the detail endpoint,
    // made it unplayable rather than merely uncaptioned.
    const parsed = VideoResponseSchema.safeParse(captionlessVideo);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.id).toBe('vid_2');
  });

  it('accepts an ordinary finished video unchanged', () => {
    expect(VideoResponseSchema.safeParse(completeVideo).success).toBe(true);
  });

  it('still rejects a video missing the fields the app actually needs', () => {
    // Making captions optional must not turn the schema into a rubber stamp:
    // `download` and `thumbnail` are what the poster and player read.
    expect(isVideoAvailable({ id: 'x', status: 'complete' })).toBe(false);
  });
});
