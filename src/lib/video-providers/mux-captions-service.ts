import type { VideoLang } from '#/lib/video-languages';
import {
  type CaptionStatus,
  captionTrackName,
  describeMuxError,
  findAudioTrackId,
  type MuxCaptionCode,
  type MuxTrack,
  muxCaptionLanguage,
  pickCaptionTrack,
  shouldRefreshCaptions,
  trackOutcome,
  type VideoCaptionsRow,
} from './mux-captions';

export interface CaptionsStore {
  get(playbackId: string): Promise<VideoCaptionsRow | null>;
  upsert(row: VideoCaptionsRow): Promise<void>;
}

export interface MuxCaptionsApi {
  assetIdForPlayback(playbackId: string): Promise<string>;
  assetTracks(assetId: string): Promise<MuxTrack[]>;
  generateSubtitles(
    assetId: string,
    audioTrackId: string,
    code: MuxCaptionCode,
    name: string,
  ): Promise<void>;
}

/** `api: null` — the course has no Mux API token; nothing can be generated or refreshed. */
export interface CaptionsDeps {
  store: CaptionsStore;
  api: MuxCaptionsApi | null;
  now: () => Date;
}

export type RequestCaptionsResult = CaptionStatus | 'no_token';

class CaptionsFailure extends Error {}

async function safeUpsert(
  store: CaptionsStore,
  row: VideoCaptionsRow,
): Promise<void> {
  try {
    await store.upsert(row);
  } catch (error) {
    console.error(
      `Mux captions store write failed for ${row.playbackId}:`,
      error,
    );
  }
}

async function safeGet(
  store: CaptionsStore,
  playbackId: string,
): Promise<VideoCaptionsRow | null> {
  try {
    return await store.get(playbackId);
  } catch (error) {
    console.error(`Mux captions store read failed for ${playbackId}:`, error);
    return null;
  }
}

const baseLanguage = (code: string | undefined) => code?.split('-')[0];

/**
 * Make sure Mux is captioning this video: reuse a matching text track if the
 * asset has one, otherwise ask Mux to generate one. Never throws — every
 * outcome is recorded on the row so the admin sees it and can retry (a failed
 * store write is logged and the status still returned). A video already
 * `generating` in this language is not asked again, so no duplicate tracks.
 */
export async function requestMuxCaptions(
  { store, api, now }: CaptionsDeps,
  { playbackId, lang }: { playbackId: string; lang: VideoLang },
): Promise<RequestCaptionsResult> {
  const code = muxCaptionLanguage(lang);
  const base = {
    playbackId,
    assetId: null,
    trackId: null,
    error: null,
    checkedAt: now(),
  };
  if (code === null) {
    await safeUpsert(store, {
      ...base,
      languageCode: lang,
      status: 'unsupported',
    });
    return 'unsupported';
  }
  if (api === null) return 'no_token';

  const stored = await safeGet(store, playbackId);
  if (
    stored?.status === 'generating' &&
    stored.languageCode === code &&
    stored.assetId !== null
  ) {
    return 'generating';
  }

  let assetId: string | null = null;
  try {
    assetId = await api.assetIdForPlayback(playbackId);
    const tracks = await api.assetTracks(assetId);
    const existing = pickCaptionTrack(tracks, code);
    if (existing) {
      await safeUpsert(store, {
        ...base,
        assetId,
        trackId: existing.trackId,
        languageCode: code,
        status: existing.status,
      });
      return existing.status;
    }
    const audioTrackId = findAudioTrackId(tracks);
    if (audioTrackId === null) {
      throw new CaptionsFailure('the video has no audio track.');
    }
    await api.generateSubtitles(
      assetId,
      audioTrackId,
      code,
      captionTrackName(lang),
    );
    // Read the asset back for the new track's id — the status refresh
    // follows that track. Absent (Mux not yet listing it, or the read-back
    // failing) is still `generating`: Mux accepted the request.
    let trackId: string | null = null;
    try {
      trackId =
        pickCaptionTrack(await api.assetTracks(assetId), code)?.trackId ?? null;
    } catch (error) {
      console.error(
        `Mux caption track read-back failed for ${playbackId}:`,
        error,
      );
    }
    await safeUpsert(store, {
      ...base,
      assetId,
      trackId,
      languageCode: code,
      status: 'generating',
    });
    return 'generating';
  } catch (error) {
    const message =
      error instanceof CaptionsFailure
        ? `Mux couldn't generate captions: ${error.message}`
        : describeMuxError(error);
    await safeUpsert(store, {
      ...base,
      assetId,
      languageCode: code,
      status: 'failed',
      error: message,
    });
    return 'failed';
  }
}

/**
 * The stored caption state, refreshed from Mux at most once a minute while
 * generating. Never throws: a refresh failure is logged and the stale row is
 * returned (with `checkedAt` bumped, so a Mux outage is not re-asked on
 * every playback). A failing store read resolves `null`.
 */
export async function readMuxCaptions(
  { store, api, now }: CaptionsDeps,
  playbackId: string,
): Promise<VideoCaptionsRow | null> {
  const row = await safeGet(store, playbackId);
  if (!row) return null;
  const at = now();
  if (!api || !shouldRefreshCaptions(row, at, true)) return row;
  // shouldRefreshCaptions guarantees the asset id is set.
  const assetId = row.assetId as string;
  try {
    const tracks = await api.assetTracks(assetId);
    // A row written right after `generate-subtitles` may not know its track
    // yet (Mux had not listed it): find it by language now, or keep waiting.
    let trackId = row.trackId;
    let outcome: 'ready' | 'generating' | 'failed';
    if (trackId === null) {
      const found = pickCaptionTrack(
        tracks,
        row.languageCode as MuxCaptionCode,
      );
      trackId = found?.trackId ?? null;
      // pickCaptionTrack skips errored tracks: without this a row that never
      // learned its track id would stay `generating` forever.
      const errored = tracks.some(
        (t) =>
          t.type === 'text' &&
          t.status === 'errored' &&
          baseLanguage(t.language_code) === row.languageCode,
      );
      outcome = found?.status ?? (errored ? 'failed' : 'generating');
    } else {
      outcome = trackOutcome(tracks, trackId);
    }
    const next: VideoCaptionsRow = {
      ...row,
      trackId,
      status: outcome,
      error:
        outcome === 'failed'
          ? "Mux couldn't generate captions: the caption track failed."
          : null,
      checkedAt: at,
    };
    await store.upsert(next);
    return next;
  } catch (error) {
    console.error(`Mux captions refresh failed for ${playbackId}:`, error);
    const next = { ...row, checkedAt: at };
    try {
      await store.upsert(next);
    } catch {
      // The stale row is still the right answer for this read.
    }
    return next;
  }
}
