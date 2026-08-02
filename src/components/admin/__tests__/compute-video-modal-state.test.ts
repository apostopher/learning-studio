import { describe, expect, it } from 'vitest';
import {
  computeVideoModalState,
  type VideoModalStateInput,
} from '../compute-video-modal-state';

const input = (
  over: Partial<VideoModalStateInput> = {},
): VideoModalStateInput =>
  ({
    isFetched: true,
    isError: false,
    errorMessage: null,
    data: null,
    ...over,
  }) as VideoModalStateInput;

const ready = {
  status: 'ready' as const,
  url: 'https://example.test/v.m3u8',
  kind: 'hls' as const,
  expiresInSeconds: 3600,
  poster: null,
  captions: null,
};

describe('computeVideoModalState', () => {
  it('plays a ready video', () => {
    const state = computeVideoModalState(input({ data: ready }));
    expect(state).toEqual({ kind: 'ready', playback: ready });
  });

  it('separates "nothing has arrived" from "the answer was nothing"', () => {
    // These are the two states that used to render as the same grey box, and
    // the reason a stuck modal could not be diagnosed from a screenshot.
    expect(
      computeVideoModalState(input({ isFetched: false, data: undefined })).kind,
    ).toBe('loading');
    expect(computeVideoModalState(input({ data: null })).kind).toBe(
      'unavailable',
    );
  });

  it('does not report loading for a query that has simply never run', () => {
    // A disabled query reports isLoading forever, so `!isLoading` would make a
    // never-opened modal indistinguishable from an in-flight one. isFetched is
    // the flag that actually answers "did a result arrive".
    expect(
      computeVideoModalState(input({ isFetched: true, data: null })).kind,
    ).not.toBe('loading');
  });

  it('distinguishes rendering from failed', () => {
    expect(
      computeVideoModalState(input({ data: { status: 'rendering' } })).kind,
    ).toBe('rendering');
    expect(
      computeVideoModalState(input({ data: { status: 'failed' } })).kind,
    ).toBe('failed');
  });

  it('reports an error ahead of anything else, and carries its message', () => {
    // An error can leave stale data behind or clear isFetched depending on the
    // path; either way the failure is the thing worth showing.
    const state = computeVideoModalState(
      input({ isError: true, errorMessage: 'key refused', data: ready }),
    );
    expect(state).toEqual({ kind: 'error', message: 'key refused' });
  });

  it('still says something when an error carries no message', () => {
    const state = computeVideoModalState(
      input({ isError: true, errorMessage: null }),
    );
    expect(state.kind).toBe('error');
    expect(state.kind === 'error' && state.message.length > 0).toBe(true);
  });
});
