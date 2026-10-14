import { resolveCourseProvider } from '#/db/admin';
import { muxCaptionsForPlayback } from '#/db/video-captions';
import type { VideoLang } from '#/lib/video-languages';
import { PlaybackError } from '#/lib/video-providers/errors';
import {
  type PlaybackResult,
  resolvePlayback,
} from '#/lib/video-providers/resolve.server';
import { selectVideoForLang } from '#/lib/video-providers/select-video-for-lang';
import type { ProviderId } from '#/lib/video-providers/types';
import { OtherVideoIdsSchema } from '#/types';

/** A `PlaybackResult` plus which language it is and which the lesson offers. */
export type LessonPlaybackResult = PlaybackResult & {
  lang: VideoLang;
  languages: VideoLang[];
};

/**
 * The one definition of "play this lesson in this language for this course",
 * shared by the learner resolver and the admin preview so they cannot drift.
 * Lives apart from `lesson-playback.ts` for the tests, not the runtime graph
 * (`admin.ts` imports `lesson-playback.ts` anyway, for cache invalidation):
 * the admin resolver's tests stub `#/db/lesson-playback` wholesale, so a
 * resolver kept there would be stubbed out from under `resolveLessonPlayback`.
 * It imports `resolveCourseProvider` back from `admin.ts` — a cycle, safe
 * only because neither side reads the other at module load, just at call time.
 *
 * Credentials are looked up for the SELECTED video's provider: an alternate
 * may live on a different provider than the primary.
 */
export async function resolveSelectedLessonVideo({
  provider,
  ref,
  otherVideoIds,
  courseId,
  lang,
}: {
  provider: ProviderId;
  ref: string;
  otherVideoIds: unknown;
  courseId: number;
  lang: VideoLang;
}): Promise<LessonPlaybackResult> {
  // A column that fails the schema (a row written under the old
  // `{ lang: 'FR', videoId }` shape, or by hand) must not take the English
  // video down with it — it simply offers no alternates.
  const alternates = OtherVideoIdsSchema.safeParse(otherVideoIds);
  const selection = selectVideoForLang({
    primary: { provider, ref },
    alternates: alternates.success ? alternates.data : [],
    requested: lang,
  });

  const creds = await resolveCourseProvider(courseId, selection.provider);
  // Throws rather than returning null: null is indistinguishable from "no
  // such lesson" / "no video assigned", which callers render as an opaque
  // refusal or 404. A missing course credential is an admin misconfiguration
  // and must stay distinguishable.
  if (!creds) {
    throw new PlaybackError(
      'PROVIDER_NOT_CONFIGURED',
      `This course has no ${selection.provider} credentials configured.`,
    );
  }
  const playback = await resolvePlayback(
    selection.provider,
    selection.ref,
    creds,
    { muxCaptions: muxCaptionsForPlayback },
  );
  return { ...playback, lang: selection.lang, languages: selection.languages };
}
