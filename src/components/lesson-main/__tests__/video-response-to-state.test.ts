import { describe, expect, it, vi } from 'vitest';
import { videoResponseToState } from '../video-response-to-state';

const onRetry = vi.fn();

describe('videoResponseToState', () => {
  it('returns fetching when response is undefined', () => {
    expect(videoResponseToState(undefined, onRetry)).toEqual({
      status: 'fetching',
    });
  });

  it('returns ready with src + poster + tracks when video is available with download', () => {
    const result = videoResponseToState(
      {
        id: 'v1',
        status: 'complete',
        download: 'https://cdn/v.mp4',
        captions: { srt: null, vtt: 'https://cdn/v.vtt' },
        thumbnail: { gif: null, image: 'https://cdn/p.jpg', thumbHash: 'h' },
      },
      onRetry,
    );
    expect(result).toEqual({
      status: 'ready',
      src: 'https://cdn/v.mp4',
      poster: 'https://cdn/p.jpg',
      tracks: [
        {
          src: 'https://cdn/v.vtt',
          srcLang: 'en',
          label: 'English',
          kind: 'subtitles',
          default: true,
        },
      ],
    });
  });

  it('returns ready with empty tracks when vtt is null', () => {
    const result = videoResponseToState(
      {
        id: 'v1',
        status: 'complete',
        download: 'https://cdn/v.mp4',
        captions: { srt: null, vtt: null },
        thumbnail: { gif: null, image: null },
      },
      onRetry,
    );
    expect(result).toMatchObject({ status: 'ready', tracks: [] });
  });

  it('returns error when available but download is null', () => {
    const result = videoResponseToState(
      {
        id: 'v1',
        status: 'complete',
        download: null,
        captions: { srt: null, vtt: null },
        thumbnail: { gif: null, image: null },
      },
      onRetry,
    );
    expect(result).toMatchObject({
      status: 'error',
      message: 'Video is unavailable',
    });
  });

  it('returns rendering for in_progress', () => {
    expect(
      videoResponseToState({ id: 'v1', status: 'in_progress' }, onRetry),
    ).toEqual({ status: 'rendering' });
  });

  it('returns error for status=error', () => {
    expect(
      videoResponseToState({ id: 'v1', status: 'error' }, onRetry),
    ).toMatchObject({
      status: 'error',
      message: 'This video failed to render',
    });
  });

  it('returns error for status=rejected', () => {
    expect(
      videoResponseToState({ id: 'v1', status: 'rejected' }, onRetry),
    ).toMatchObject({
      status: 'error',
      message: 'This video failed to render',
    });
  });
});
