/**
 * Request Mux auto-captions for every lesson video already on Mux.
 * Idempotent: playback ids that already have a `video_captions` row are
 * skipped, so it is safe to re-run (e.g. after adding a token to a course).
 *
 * Run: pnpm db:backfill-mux-captions
 */
import { isNotNull } from 'drizzle-orm';
import { db } from '#/db';
import { lessonsTable } from '#/db/schema';
import {
  captionsStore,
  findCaptionsApi,
  requestLessonCaptions,
} from '#/db/video-captions';
import { PRIMARY_VIDEO_LANG, type VideoLang } from '#/lib/video-languages';
import { OtherVideoIdsSchema } from '#/types';

async function main(): Promise<void> {
  const lessons = await db
    .select({
      id: lessonsTable.id,
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
      otherVideoIds: lessonsTable.otherVideoIds,
    })
    .from(lessonsTable)
    .where(isNotNull(lessonsTable.videoRef));

  const counts = {
    requested: 0,
    ready: 0,
    unsupported: 0,
    failed: 0,
    noToken: 0,
    skipped: 0,
  };
  for (const lesson of lessons) {
    const targets: { ref: string; lang: VideoLang }[] = [];
    if (lesson.provider === 'mux' && lesson.ref) {
      targets.push({ ref: lesson.ref, lang: PRIMARY_VIDEO_LANG });
    }
    const alternates = OtherVideoIdsSchema.safeParse(lesson.otherVideoIds);
    for (const alt of alternates.success ? alternates.data : []) {
      if (alt.provider === 'mux') targets.push({ ref: alt.ref, lang: alt.lang });
    }
    if (targets.length === 0) continue;
    if (!(await findCaptionsApi(lesson.id))) {
      counts.noToken += targets.length;
      continue;
    }
    for (const { ref, lang } of targets) {
      if (await captionsStore.get(ref)) {
        counts.skipped += 1;
        continue;
      }
      const outcome = await requestLessonCaptions({
        lessonId: lesson.id,
        playbackId: ref,
        lang,
      });
      if (outcome === 'generating') counts.requested += 1;
      else if (outcome === 'ready') counts.ready += 1;
      else if (outcome === 'unsupported') counts.unsupported += 1;
      else if (outcome === 'no_token') counts.noToken += 1;
      else counts.failed += 1;
    }
  }
  console.info('Mux captions backfill:', counts);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
