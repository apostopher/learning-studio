/**
 * One-off: convert the legacy `other_video_ids` rows `import-course.ts`
 * copied over — `[{ lang: 'FR', videoId: 'https://share.synthesia.io/<en-id>?language=fr' }]`
 * — into the shape the app reads, `[{ lang, provider, ref }]`, pointing at
 * the account's actual French render. See `./migrate-other-video-ids.ts`
 * for why the old link cannot simply be re-parsed.
 *
 * Against `DATABASE_URL` it writes exactly one column, `other_video_ids`,
 * and only on lessons whose row is still in the legacy shape AND resolved
 * to a French video. Lessons whose video has no French render are listed
 * and left untouched — the column already reads as "no alternates" for
 * them, and an admin can attach one later in the Video tab. Each written
 * lesson's playback cache is evicted so the menu appears without waiting
 * for a TTL. Idempotent: a migrated row is not legacy any more and is
 * skipped on re-run.
 *
 *   pnpm db:migrate-other-video-ids            # dry run, prints the plan
 *   pnpm db:migrate-other-video-ids --write    # applies it
 */
import { Pool } from 'pg';
import { getLessonPlayback } from '../src/db/lesson-playback';
import { env } from '../src/env';
import {
  isLegacyAlternates,
  type LessonPlan,
  planLessonAlternates,
  type SynthesiaVideoIndex,
} from './migrate-other-video-ids';

const WRITE = process.argv.includes('--write');
const PAGE = 100;

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => (await db.query(sql, params)).rows as T[];

/** Every video in the account, by id → title, from the list endpoint. */
async function loadVideoIndex(): Promise<SynthesiaVideoIndex> {
  const titleById = new Map<string, string>();
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `https://api.synthesia.io/v2/videos?limit=${PAGE}&offset=${offset}`,
      {
        headers: { Accept: 'application/json', Authorization: env.SYNTHESIA_API_KEY },
      },
    );
    if (!res.ok) throw new Error(`Synthesia list returned ${res.status}`);
    const page = (await res.json()) as {
      videos: { id: string; title?: string }[];
    };
    for (const v of page.videos) titleById.set(v.id, v.title ?? '');
    if (page.videos.length < PAGE) break;
  }
  return { titleById };
}

async function main() {
  const rows = await q<{
    id: number;
    slug: string;
    video_ref: string | null;
    other_video_ids: unknown;
  }>(
    `select id, slug, video_ref, other_video_ids
       from lessons
      where other_video_ids is not null and other_video_ids::text <> '[]'
      order by slug`,
  );
  const legacy = rows.filter((r) => isLegacyAlternates(r.other_video_ids));
  console.log(
    `${rows.length} lessons carry other_video_ids; ${legacy.length} in the legacy shape`,
  );
  if (legacy.length === 0) {
    await db.end();
    return;
  }

  const index = await loadVideoIndex();
  console.log(`${index.titleById.size} videos in the Synthesia account\n`);

  const plans: (LessonPlan & { id: number })[] = [];
  for (const row of legacy) {
    if (!row.video_ref || !isLegacyAlternates(row.other_video_ids)) continue;
    plans.push({
      id: row.id,
      ...planLessonAlternates(
        { slug: row.slug, videoRef: row.video_ref, legacy: row.other_video_ids },
        index,
      ),
    });
  }

  const writable = plans.filter((p) => p.resolved.length > 0);
  const untouched = plans.filter((p) => p.resolved.length === 0);

  for (const p of writable) {
    console.log(
      `${p.slug}: ${p.resolved
        .map((r) => `${r.lang} → ${r.ref} (${r.title}, ${r.how})`)
        .join('; ')}`,
    );
  }
  if (untouched.length > 0) {
    console.log(`\nleft untouched (${untouched.length}):`);
    for (const p of untouched) {
      console.log(
        `  ${p.slug}: ${p.unresolved.map((u) => u.reason).join('; ')}`,
      );
    }
  }

  if (!WRITE) {
    console.log(
      `\ndry run — ${writable.length} lessons would be written. Re-run with --write.`,
    );
    await db.end();
    return;
  }

  let written = 0;
  for (const p of writable) {
    const next = p.resolved.map(({ lang, provider, ref }) => ({
      lang,
      provider,
      ref,
    }));
    // Guarded on the legacy shape still being there: a concurrent admin
    // edit through the Video tab wins over this one-off.
    const res = await db.query(
      `update lessons set other_video_ids = $2::jsonb, updated_at = now()
        where id = $1 and other_video_ids::text like '%videoId%'`,
      [p.id, JSON.stringify(next)],
    );
    if (res.rowCount === 1) {
      written += 1;
      await getLessonPlayback.invalidate(p.slug);
    } else {
      console.log(`  skipped ${p.slug}: row changed since the plan was made`);
    }
  }
  console.log(`\nwritten: ${written} of ${writable.length}`);
  await db.end();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    // The redis client used by `invalidate` keeps no open handle, but the
    // server modules pulled in above may — exit explicitly, like the other
    // one-offs do implicitly via process.exit in their error path.
    process.exit(0);
  });
