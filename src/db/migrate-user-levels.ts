import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Idempotent migration for per-course user levels.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole schema
 * and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-user-levels
 */
async function main(): Promise<void> {
  console.info('Creating user_levels…');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_levels (
      id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id         varchar(255) NOT NULL
                        REFERENCES user_profiles(user_id) ON DELETE CASCADE,
      course_id       integer NOT NULL
                        REFERENCES courses(id) ON DELETE CASCADE,
      level           text NOT NULL,
      source          text NOT NULL,
      message         text,
      note            text,
      changed_by      varchar(255),
      acknowledged_at timestamp,
      created_at      timestamp NOT NULL DEFAULT now()
    );
  `);

  console.info('Indexing the latest-row lookup…');
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_levels_lookup_idx
      ON user_levels (user_id, course_id, created_at DESC);
  `);

  // At most one EARNED row per (user, course, level). See the matching index
  // in src/db/schema.ts for why it is partial. This is the backstop for the
  // conditional insert in `insertEarnedLevelRow`: without it, two overlapping
  // progress writes can each append a promotion row and send a real email.
  console.info('Enforcing one earned promotion per tier…');
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_levels_earned_once_idx
      ON user_levels (user_id, course_id, level)
      WHERE source = 'earned';
  `);

  console.info('Adding lessons.levels…');
  await db.execute(sql`
    ALTER TABLE lessons
      ADD COLUMN IF NOT EXISTS levels text[] NOT NULL DEFAULT '{}';
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS lessons_levels_gin ON lessons USING gin (levels);
  `);

  // Backfill: every existing enrolment gets its starting Basic row, so the
  // read path never has to cope with an enrolled pilot who has no level.
  console.info('Backfilling enrolment rows…');
  const result = await db.execute(sql`
    INSERT INTO user_levels (user_id, course_id, level, source)
    SELECT cs.user_id, cs.course_id, 'basic', 'enrolment'
    FROM course_subscriptions cs
    WHERE NOT EXISTS (
      SELECT 1 FROM user_levels ul
      WHERE ul.user_id = cs.user_id AND ul.course_id = cs.course_id
    );
  `);
  console.info(`Backfilled ${result.rowCount ?? 0} enrolment level row(s).`);
  console.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
