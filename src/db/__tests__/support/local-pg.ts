import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { vi } from 'vitest';
import { LESSON_VERSION_NOTES_STATEMENTS } from '#/db/migrate-lesson-version-notes';
import { migrateLessonVersions } from '#/db/migrate-lesson-versions';
import { LESSON_VISIBILITY_STATEMENTS } from '#/db/migrate-lesson-visibility';
import * as schema from '#/db/schema';

/**
 * Real Postgres for tests, LOCAL ONLY: `.env.local` (which vitest loads) names
 * production, so nothing here reads DATABASE_URL and every connection goes
 * through `localConnection`, which throws on any other host.
 *
 * Pattern for a test file whose subject imports `#/db` (`vi.mock` is hoisted,
 * hence the hoisted holder; the getter hands out whatever `beforeAll` stored):
 *
 *   const h = vi.hoisted(() => ({ db: null as unknown }));
 *   vi.mock('#/db', () => ({ get db() { return h.db; } }));
 *   describe.skipIf(!process.env.TEST_DATABASE_URL)('…', () => {
 *     let pgDb: FreshDb;
 *     beforeAll(async () => { pgDb = await freshDb({ migrated: true }); h.db = pgDb.db; });
 *     afterAll(() => pgDb?.drop());
 *   });
 */
export type TestDb = NodePgDatabase<typeof schema> & { $client: pg.Pool };
export type FreshDb = { db: TestDb; pool: pg.Pool; drop(): Promise<void> };

// Creating databases on a loaded machine outlasts the defaults. Applies to the
// file importing this.
if (process.env.TEST_DATABASE_URL) {
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
}

const TEST_DB_PREFIX = 'rmtp_versions_test_';
const FIXTURE = new URL('./schema-before-lesson-versions.sql', import.meta.url);

/** Where pg would really connect, so `?host=` in the URL cannot slip past. */
function localConnection() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) return null;
  const { host, port, user, password, database } = new pg.Client({
    connectionString,
  });
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `TEST_DATABASE_URL must point at localhost or 127.0.0.1, not "${host}"`,
    );
  }
  return { host, port, user, password: password ?? undefined, database };
}

export function localPg(): { db: TestDb; pool: pg.Pool } | null {
  const connection = localConnection();
  if (!connection) return null;
  const pool = new pg.Pool(connection);
  return { db: drizzle(pool, { schema }), pool };
}

/**
 * Run `sql` (the schema before lesson versions, unless a test supplies its
 * own) in a new empty database.
 *
 * The local server may be Postgres 14, which has no NULLS NOT DISTINCT: there
 * the two `docs`/`doc_urls` unique keys load as plain UNIQUE, so rows with a
 * null `course_id` do not dedupe as they do in production.
 */
export async function createDb(
  sql: string = readFileSync(FIXTURE, 'utf8'),
): Promise<FreshDb> {
  const connection = localConnection();
  if (!connection) throw new Error('TEST_DATABASE_URL is not set');
  const name = `${TEST_DB_PREFIX}${randomUUID().replaceAll('-', '')}`;

  const admin = async (statement: string) => {
    const client = new pg.Client(connection);
    await client.connect();
    try {
      await client.query(statement);
    } finally {
      await client.end();
    }
  };

  // template0: nobody can be connected to it, so parallel files never collide.
  await admin(`create database "${name}" template template0`);
  const pool = new pg.Pool({ ...connection, database: name });
  let dropped: Promise<void> | undefined;
  const drop = () => {
    dropped ??= pool
      .end()
      .then(() => admin(`drop database if exists "${name}"`));
    return dropped;
  };
  try {
    const { rows } = await pool.query<{ v: number }>(
      `select current_setting('server_version_num')::int as v`,
    );
    await pool.query('create extension vector');
    await pool.query(
      rows[0].v < 150000
        ? sql.replaceAll('UNIQUE NULLS NOT DISTINCT', 'UNIQUE')
        : sql,
    );
  } catch (error) {
    await drop();
    throw error;
  }
  return { db: drizzle(pool, { schema }), pool, drop };
}

/** A new database holding the schema before lesson versions, or today's. */
export async function freshDb({
  migrated,
}: {
  migrated: boolean;
}): Promise<FreshDb> {
  const fresh = await createDb();
  if (!migrated) return fresh;
  try {
    await migrateLessonVersions(fresh.db);
    for (const statement of [
      ...LESSON_VISIBILITY_STATEMENTS,
      ...LESSON_VERSION_NOTES_STATEMENTS,
    ]) {
      await fresh.db.execute(statement);
    }
  } catch (error) {
    await fresh.drop();
    throw error;
  }
  return fresh;
}
