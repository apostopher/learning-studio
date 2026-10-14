import { eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { resolveCourseProvider } from '#/db/admin';
import { getCourseIdsForLesson } from '#/db/placements';
import { lessonsTable, videoCaptionsTable } from '#/db/schema';
import type { VideoLang } from '#/lib/video-languages';
import { muxApiFromCreds } from '#/lib/video-providers/mux-api.server';
import type {
  CaptionStatus,
  MuxCaptionsLookup,
  VideoCaptionsRow,
} from '#/lib/video-providers/mux-captions';
import {
  type CaptionsStore,
  type MuxCaptionsApi,
  type RequestCaptionsResult,
  readMuxCaptions,
  requestMuxCaptions,
} from '#/lib/video-providers/mux-captions-service';
import { selectVideoForLang } from '#/lib/video-providers/select-video-for-lang';
import type { ProviderId } from '#/lib/video-providers/types';
import { OtherVideoIdsSchema } from '#/types';

export const captionsStore: CaptionsStore = {
  async get(playbackId) {
    const [row] = await db
      .select()
      .from(videoCaptionsTable)
      .where(eq(videoCaptionsTable.playbackId, playbackId));
    return row ? { ...row, status: row.status as CaptionStatus } : null;
  },
  async upsert(row: VideoCaptionsRow) {
    const { playbackId: _playbackId, ...rest } = row;
    await db
      .insert(videoCaptionsTable)
      .values(row)
      .onConflictDoUpdate({
        target: videoCaptionsTable.playbackId,
        set: { ...rest, updatedAt: sql`now()` },
      });
  },
};

/**
 * The Mux API to caption a lesson's videos with: through the first course
 * placing the lesson whose Mux credentials carry an API token. Video is
 * lesson content (saved without a course in hand), and every course points
 * at the same Mux environment, so any token-bearing course will do.
 */
export async function findCaptionsApi(
  lessonId: number,
): Promise<MuxCaptionsApi | null> {
  for (const courseId of await getCourseIdsForLesson(lessonId)) {
    const api = muxApiFromCreds(await resolveCourseProvider(courseId, 'mux'));
    if (api) return api;
  }
  return null;
}

/** Which video a lesson plays for `lang` — the same rule as playback. */
export async function getCaptionsTarget(
  lessonId: number,
  lang: VideoLang,
): Promise<{ provider: ProviderId; ref: string; lang: VideoLang } | null> {
  const [lesson] = await db
    .select({
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
      otherVideoIds: lessonsTable.otherVideoIds,
    })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId));
  if (!lesson?.provider || !lesson.ref) return null;
  const alternates = OtherVideoIdsSchema.safeParse(lesson.otherVideoIds);
  const selection = selectVideoForLang({
    primary: { provider: lesson.provider as ProviderId, ref: lesson.ref },
    alternates: alternates.success ? alternates.data : [],
    requested: lang,
  });
  return {
    provider: selection.provider,
    ref: selection.ref,
    lang: selection.lang,
  };
}

export async function requestLessonCaptions({
  lessonId,
  playbackId,
  lang,
}: {
  lessonId: number;
  playbackId: string;
  lang: VideoLang;
}): Promise<RequestCaptionsResult> {
  return requestMuxCaptions(
    {
      store: captionsStore,
      api: await findCaptionsApi(lessonId),
      now: () => new Date(),
    },
    { playbackId, lang },
  );
}

/** For save routes: captions must never fail the save that triggered them. */
export async function requestLessonCaptionsSafely(input: {
  lessonId: number;
  playbackId: string;
  lang: VideoLang;
}): Promise<void> {
  try {
    await requestLessonCaptions(input);
  } catch (error) {
    console.error(
      `Mux captions request failed for lesson ${input.lessonId}:`,
      error,
    );
  }
}

/**
 * Playback's view of a Mux video's captions, refreshing through the SERVING
 * course's token when it has one. Injected into `resolvePlayback`.
 */
export async function muxCaptionsForPlayback(
  playbackId: string,
  creds: unknown,
): Promise<MuxCaptionsLookup> {
  const row = await readMuxCaptions(
    {
      store: captionsStore,
      api: muxApiFromCreds(creds),
      now: () => new Date(),
    },
    playbackId,
  );
  if (row?.status === 'ready' && row.trackId) {
    return { status: 'ready', trackId: row.trackId };
  }
  if (row?.status === 'generating') return { status: 'pending' };
  return null;
}

export type LessonCaptionsStatus =
  | CaptionStatus
  | 'none'
  | 'no_token'
  | 'not_mux';

/** The admin captions line's data. `null`: no such lesson, or no video. */
export async function getLessonCaptionsStatus(
  lessonId: number,
  lang: VideoLang,
): Promise<{
  status: LessonCaptionsStatus;
  error: string | null;
  lang: VideoLang;
} | null> {
  const target = await getCaptionsTarget(lessonId, lang);
  if (!target) return null;
  if (target.provider !== 'mux') {
    return { status: 'not_mux', error: null, lang: target.lang };
  }
  const api = await findCaptionsApi(lessonId);
  const row = await readMuxCaptions(
    { store: captionsStore, api, now: () => new Date() },
    target.ref,
  );
  if (row) return { status: row.status, error: row.error, lang: target.lang };
  return { status: api ? 'none' : 'no_token', error: null, lang: target.lang };
}
