import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoCaptionsRow } from '#/lib/video-providers/mux-captions';
import {
  type CaptionsDeps,
  type MuxCaptionsApi,
  readMuxCaptions,
  requestMuxCaptions,
} from '#/lib/video-providers/mux-captions-service';

const NOW = new Date('2026-10-14T10:00:00Z');

function memoryStore(initial: VideoCaptionsRow[] = []) {
  const rows = new Map(initial.map((r) => [r.playbackId, r]));
  return {
    rows,
    get: vi.fn(async (id: string) => rows.get(id) ?? null),
    upsert: vi.fn(async (row: VideoCaptionsRow) => {
      rows.set(row.playbackId, row);
    }),
  };
}

function api(overrides: Partial<MuxCaptionsApi> = {}): MuxCaptionsApi {
  return {
    assetIdForPlayback: vi.fn(async () => 'asset-1'),
    assetTracks: vi.fn(async () => [
      { id: 'aud', type: 'audio', status: 'ready' },
    ]),
    generateSubtitles: vi.fn(async () => {}),
    ...overrides,
  };
}

let store: ReturnType<typeof memoryStore>;
beforeEach(() => {
  store = memoryStore();
});
const deps = (a: MuxCaptionsApi | null): CaptionsDeps => ({
  store,
  api: a,
  now: () => NOW,
});

describe('requestMuxCaptions', () => {
  it('an unsupported language records `unsupported` and never calls Mux', async () => {
    const a = api();
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'ja' }),
    ).toBe('unsupported');
    expect(a.assetIdForPlayback).not.toHaveBeenCalled();
    expect(a.generateSubtitles).not.toHaveBeenCalled();
    expect(store.rows.get('p')).toMatchObject({
      status: 'unsupported',
      languageCode: 'ja',
    });
  });

  it('without an API token it writes nothing and says so', async () => {
    expect(
      await requestMuxCaptions(deps(null), { playbackId: 'p', lang: 'en' }),
    ).toBe('no_token');
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('reuses a ready text track instead of generating a duplicate', async () => {
    const a = api({
      assetTracks: vi.fn(async () => [
        { id: 'aud', type: 'audio', status: 'ready' },
        {
          id: 'txt',
          type: 'text',
          status: 'ready',
          language_code: 'en',
          text_source: 'uploaded',
        },
      ]),
    });
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('ready');
    expect(a.generateSubtitles).not.toHaveBeenCalled();
    expect(store.rows.get('p')).toMatchObject({
      assetId: 'asset-1',
      trackId: 'txt',
      status: 'ready',
    });
  });

  it('generates on the audio track in the mapped language, then records generating', async () => {
    const a = api({
      assetTracks: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'aud', type: 'audio', status: 'ready' }])
        .mockResolvedValueOnce([
          { id: 'aud', type: 'audio', status: 'ready' },
          {
            id: 'gen',
            type: 'text',
            status: 'preparing',
            language_code: 'fr',
            text_source: 'generated_vod',
          },
        ]),
    });
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'fr-CA' }),
    ).toBe('generating');
    expect(a.generateSubtitles).toHaveBeenCalledWith(
      'asset-1',
      'aud',
      'fr',
      expect.stringMatching(/\(generated\)$/),
    );
    expect(store.rows.get('p')).toMatchObject({
      status: 'generating',
      trackId: 'gen',
      languageCode: 'fr',
      checkedAt: NOW,
    });
  });

  it('a Mux failure is recorded as `failed` with the reason in words, never thrown', async () => {
    const a = api({
      assetIdForPlayback: vi.fn(async () => {
        throw Object.assign(new Error('nope'), { status: 401 });
      }),
    });
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('failed');
    expect(store.rows.get('p')).toMatchObject({
      status: 'failed',
      error: 'Mux rejected the API token.',
    });
  });

  it('an asset with no audio track fails with that reason', async () => {
    const a = api({
      assetTracks: vi.fn(async () => [{ id: 'v', type: 'video' }]),
    });
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('failed');
    expect(store.rows.get('p')?.error).toBe(
      "Mux couldn't generate captions: the video has no audio track.",
    );
  });
});

describe('readMuxCaptions', () => {
  const generating: VideoCaptionsRow = {
    playbackId: 'p',
    assetId: 'asset-1',
    trackId: 'gen',
    languageCode: 'en',
    status: 'generating',
    error: null,
    checkedAt: new Date(NOW.getTime() - 61_000),
  };

  it('no row → null, without calling Mux', async () => {
    const a = api();
    expect(await readMuxCaptions(deps(a), 'p')).toBeNull();
    expect(a.assetTracks).not.toHaveBeenCalled();
  });

  it('refreshes a stale generating row and stores the new state', async () => {
    store = memoryStore([generating]);
    const a = api({
      assetTracks: vi.fn(async () => [
        { id: 'gen', type: 'text', status: 'ready' },
      ]),
    });
    const row = await readMuxCaptions(deps(a), 'p');
    expect(a.assetTracks).toHaveBeenCalledWith('asset-1');
    expect(row).toMatchObject({ status: 'ready', checkedAt: NOW });
    expect(store.rows.get('p')?.status).toBe('ready');
  });

  it('does not ask Mux again inside the minute', async () => {
    store = memoryStore([
      { ...generating, checkedAt: new Date(NOW.getTime() - 5_000) },
    ]);
    const a = api();
    await readMuxCaptions(deps(a), 'p');
    expect(a.assetTracks).not.toHaveBeenCalled();
  });

  it('a refresh error returns the stale row and bumps checkedAt so it is not retried at once', async () => {
    store = memoryStore([generating]);
    const a = api({
      assetTracks: vi.fn(async () => {
        throw new Error('down');
      }),
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const row = await readMuxCaptions(deps(a), 'p');
    errorLog.mockRestore();
    expect(row).toMatchObject({ status: 'generating', checkedAt: NOW });
  });

  it('a generating row that never learned its track id finds it by language', async () => {
    store = memoryStore([{ ...generating, trackId: null, languageCode: 'fr' }]);
    const a = api({
      assetTracks: vi.fn(async () => [
        { id: 'late', type: 'text', status: 'ready', language_code: 'fr' },
      ]),
    });
    expect(await readMuxCaptions(deps(a), 'p')).toMatchObject({
      status: 'ready',
      trackId: 'late',
    });
  });

  it('a vanished track flips to failed with a reason', async () => {
    store = memoryStore([generating]);
    const a = api({ assetTracks: vi.fn(async () => []) });
    expect(await readMuxCaptions(deps(a), 'p')).toMatchObject({
      status: 'failed',
      error: "Mux couldn't generate captions: the caption track failed.",
    });
  });
});

describe('fix round 1', () => {
  const genRow: VideoCaptionsRow = {
    playbackId: 'p',
    assetId: 'asset-1',
    trackId: null,
    languageCode: 'fr',
    status: 'generating',
    error: null,
    checkedAt: new Date(NOW.getTime() - 61_000),
  };

  it('a generating row with no track id fails when the language track errored', async () => {
    store = memoryStore([genRow]);
    const a = api({
      assetTracks: vi.fn(async () => [
        { id: 'bad', type: 'text', status: 'errored', language_code: 'fr' },
      ]),
    });
    expect(await readMuxCaptions(deps(a), 'p')).toMatchObject({
      status: 'failed',
      error: "Mux couldn't generate captions: the caption track failed.",
    });
  });

  it('a second request while generating does not generate again', async () => {
    store = memoryStore([genRow]);
    const a = api();
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'fr' }),
    ).toBe('generating');
    expect(a.generateSubtitles).not.toHaveBeenCalled();
    expect(a.assetIdForPlayback).not.toHaveBeenCalled();
  });

  it('reuses a preparing track in the language without generating', async () => {
    const a = api({
      assetTracks: vi.fn(async () => [
        { id: 'aud', type: 'audio', status: 'ready' },
        { id: 'prep', type: 'text', status: 'preparing', language_code: 'en' },
      ]),
    });
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('generating');
    expect(a.generateSubtitles).not.toHaveBeenCalled();
    expect(store.rows.get('p')).toMatchObject({
      status: 'generating',
      trackId: 'prep',
    });
  });

  it('readMuxCaptions resolves null when the store read throws', async () => {
    store.get.mockRejectedValue(new Error('db'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readMuxCaptions(deps(api()), 'p')).toBeNull();
    errorLog.mockRestore();
  });

  it('a failing store write does not stop requestMuxCaptions reporting failed', async () => {
    store.upsert.mockRejectedValue(new Error('db'));
    const a = api({
      assetIdForPlayback: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('failed');
    errorLog.mockRestore();
  });

  it('a failing store write on the unsupported path still reports unsupported', async () => {
    store.upsert.mockRejectedValue(new Error('db'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await requestMuxCaptions(deps(api()), { playbackId: 'p', lang: 'ja' }),
    ).toBe('unsupported');
    errorLog.mockRestore();
  });

  it('a failing store read in requestMuxCaptions proceeds as if no row', async () => {
    store.get.mockRejectedValue(new Error('db'));
    const a = api();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('generating');
    errorLog.mockRestore();
    expect(a.generateSubtitles).toHaveBeenCalled();
  });

  it('a read-back failure after a successful generate is still generating', async () => {
    const a = api({
      assetTracks: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'aud', type: 'audio', status: 'ready' }])
        .mockRejectedValueOnce(new Error('down')),
    });
    expect(
      await requestMuxCaptions(deps(a), { playbackId: 'p', lang: 'en' }),
    ).toBe('generating');
    expect(store.rows.get('p')).toMatchObject({
      status: 'generating',
      trackId: null,
    });
  });
});
