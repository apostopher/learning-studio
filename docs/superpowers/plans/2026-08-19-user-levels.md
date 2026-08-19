# User Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every pilot a per-course level (`basic` / `intermediate` / `advanced`) that decides which lessons they see, advances automatically when they finish a tier, and can be corrected by an admin — with the whole transition history recorded.

**Architecture:** An append-only `user_levels` table keyed `(user_id, course_id)`; the latest row is the current level. Lessons carry a `levels text[]` where empty means all tiers. Visibility is **exact match** — enforced in `evaluateLessonGate`, which fails closed — and the existing prerequisite engine runs over the level-filtered lesson set so hidden lessons never gate visible ones. Promotion is written synchronously by a shared `maybePromote` invoked after each progress write.

**Tech Stack:** TanStack Start file-route API handlers, Drizzle + PostgreSQL, Zod, TanStack Query, Jotai, Base UI, Tailwind, Vitest, Resend, Biome.

**Spec:** `docs/superpowers/specs/2026-08-19-user-levels.md` — read it before Task 1 and keep it open.

## Global Constraints

- **Never run `db:push` or `drizzle-kit generate`.** Migrations are hand-written idempotent SQL run via `tsx`; `db:push` offers to truncate `docs` (6917 embedding rows) over unrelated pre-existing drift. Follow `src/db/migrate-user-management.ts` exactly.
- **No `pgEnum`.** Closed value sets are a `as const` tuple → `z.enum(...)`, persisted as `text`. There is zero `pgEnum` in this repo.
- Primary keys are `integer().primaryKey().generatedAlwaysAsIdentity()`, never `serial`.
- Timestamps in `src/db/schema.ts` are `timestamp('col', { mode: 'date' })`. `updatedAt` is set explicitly in application code, never `$onUpdate`.
- Import alias is `#/*` (both `#/*` and `@/*` map to `./src/*`, but tests and server modules use `#/`).
- Formatting/linting is **Biome** (`pnpm check`), not Prettier/ESLint.
- Tests: `pnpm test` (`vitest run`). Server-route tests start with `// @vitest-environment node`, use a `vi.hoisted()` bag named `m`, and `vi.mock` every `#/db/*` and `#/lib/*.server` dependency **before** importing the handler. Copy `src/routes/api/admin/__tests__/users-route.test.ts` for style.
- **Assert on what the consumer received** — the arguments a mocked collaborator was called with — never that a value exists in state.
- **Every test must be seen to fail first.** `git stash` the implementation, run, confirm red, `git stash pop`.
- CSS uses **logical properties** (`ms-*`, `pe-*`, `start-*`, `border-s`, `text-start`), never physical.
- Colors come from the semantic token layer (`--color-N-text`, `bg-gray-3`, etc). No hardcoded hex, no Tailwind palette classes.
- Presentational components are pure, hookless functions taking props. Containers hold state and data hooks.
- All client data access goes through TanStack Query hooks in `src/data-hooks/`, never bare `fetch` in a component.
- Display labels for levels live in a map, never inlined — renaming must not be a migration.

---

## File Structure

**Created:**
| File | Responsibility |
|---|---|
| `src/db/migrate-user-levels.ts` | Idempotent SQL migration |
| `src/db/user-levels.ts` | All reads/writes of `user_levels` |
| `src/lib/level-visibility.ts` | Pure: is a lesson visible at a level; filter a course to a level |
| `src/lib/tier-completion.ts` | Pure: next level; is the current tier complete |
| `src/lib/level-labels.ts` | Display labels + ordering |
| `src/lib/promotion.server.ts` | `maybePromote` — the one promotion writer |
| `src/lib/email/templates/level-promotion-email.ts` | Promotion email copy + HTML |
| `src/lib/email/send-level-promotion-email.ts` | Resend send |
| `src/routes/api/admin/users.$profileId.levels.ts` | Admin GET history / PUT level |
| `src/routes/api/user/level-acknowledge.ts` | Pilot dismisses a change notice |
| `src/data-hooks/use-user-levels.ts` | Admin level query + mutation |
| `src/data-hooks/use-my-level.ts` | Learner level query + acknowledge mutation |
| `src/components/admin/users/user-course-level-row.tsx` | Presentational: select + history |
| `src/components/course-level-banner.tsx` | Presentational: AlertBar content |
| `src/components/promotion-interstitial.tsx` | Presentational: promotion moment |

**Modified:** `src/types.ts`, `src/db/schema.ts`, `src/db/course.ts`, `src/db/admin.ts`, `src/db/users.ts`, `src/lib/lesson-gating.ts`, `src/lib/lesson-gating-inputs.ts`, `src/lib/lesson-gating.server.ts`, `src/lib/course-details-shape.ts`, `src/lib/admin-schemas.ts`, `src/lib/auth.ts`, `src/db/pending-enrolments.ts`, `src/routes/api/user/lesson-section.ts`, `src/routes/api/user/report-video-progress.ts`, `src/components/admin/users/user-detail-modal.tsx`, `src/components/admin/lesson-config/config-section-container.tsx`, `src/routes/_authed.tsx`, `package.json`.

---

# Phase 1 — Data foundation

### Task 1: Types, schema, and migration

**Files:**
- Modify: `src/types.ts` (after line 6, next to `SubscriptionsSchema`)
- Modify: `src/db/schema.ts` (add `levels` to `lessonsTable`; add `userLevelsTable` after `courseSubscriptionsTable`)
- Create: `src/db/migrate-user-levels.ts`
- Modify: `package.json` (scripts)
- Test: `src/lib/__tests__/level-visibility.test.ts` (created in Task 3; nothing to test here beyond types compiling)

**Interfaces:**
- Produces: `UserLevel`, `UserLevelSchema`, `UserLevelsSchema`, `LevelSource`, `LevelSourceSchema`, `USER_LEVELS`, `userLevelsTable`, `lessonsTable.levels`.

- [ ] **Step 1: Add the value sets to `src/types.ts`**

Insert directly after the `SubscriptionType` export (line 6):

```ts
/**
 * A pilot's competence tier within one course. Ordered — index is the rung.
 *
 * Stored as `text` rather than a pg enum, matching `required_subscriptions`:
 * adding a tier should not need a migration, and the zod schema at the API
 * edge is what constrains the values.
 */
export const USER_LEVELS = ['basic', 'intermediate', 'advanced'] as const;
export const UserLevelSchema = z.enum(USER_LEVELS);
export const UserLevelsSchema = z.array(UserLevelSchema);
export type UserLevel = (typeof USER_LEVELS)[number];

/**
 * Where a `user_levels` row came from.
 *
 * `enrolment` — the idempotent starting row. `earned` — the pilot completed a
 * tier. `admin` — a human intervened, and `message` is required.
 */
export const LEVEL_SOURCES = ['enrolment', 'earned', 'admin'] as const;
export const LevelSourceSchema = z.enum(LEVEL_SOURCES);
export type LevelSource = (typeof LEVEL_SOURCES)[number];
```

- [ ] **Step 2: Add `levels` to `lessonsTable` in `src/db/schema.ts`**

Add immediately after the `requiredSubscriptions` line:

```ts
  /**
   * Which competence tiers see this lesson. **Empty means every tier** — so the
   * pre-existing catalogue stays fully visible and authors opt lessons in one
   * at a time. Matching is exact, not a ceiling: an `advanced` pilot does not
   * see a `['basic']` lesson.
   */
  levels: text('levels').array().notNull().default(sql`'{}'::text[]`),
```

Then extend the select schema refinement below the table:

```ts
export const dbLessonSchema = createSelectSchema(lessonsTable, {
  requiredSubscriptions: SubscriptionsSchema,
  levels: UserLevelsSchema,
});
```

Add `UserLevelsSchema`, `UserLevelSchema`, `LevelSourceSchema` to the existing `#/types` import at the top of the file, and confirm `sql` is imported from `drizzle-orm` (it already is).

- [ ] **Step 3: Add `userLevelsTable` to `src/db/schema.ts`**

Place it directly after `courseSubscriptionsTable` and its relations:

```ts
/**
 * Append-only record of a pilot's level in one course. **The latest row wins.**
 *
 * There is deliberately no `level` column on `user_profiles`: the requirement
 * is to capture that a pilot *becomes* intermediate or advanced — the
 * transition, not just the value. A column cannot answer "when did they
 * advance?" or "how long is the average pilot at Basic?".
 *
 * Rows are never updated except to stamp `acknowledgedAt`, and never deleted.
 * A correction is a newer row, which means undo is a single insert and a
 * demotion destroys no progress.
 *
 * `changedBy` is a plain id rather than an FK — the audit string should outlive
 * the account that wrote it, matching `courseSubscriptions.grantedBy`.
 */
export const userLevelsTable = pgTable(
  'user_levels',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    level: text('level').$type<UserLevel>().notNull(),
    source: text('source').$type<LevelSource>().notNull(),
    /** Pilot-facing. Required when `source` is 'admin', null otherwise. */
    message: text('message'),
    /** Admin-only context. Never rendered to the pilot. */
    note: text('note'),
    /** Acting admin's user id. Null for 'enrolment' and 'earned' rows. */
    changedBy: varchar('changed_by', { length: 255 }),
    /** Set when the pilot dismisses the change notice. Null = unseen. */
    acknowledgedAt: timestamp('acknowledged_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('user_levels_lookup_idx').on(
      table.userId,
      table.courseId,
      desc(table.createdAt),
    ),
  ],
);

export const dbUserLevelSchema = createSelectSchema(userLevelsTable, {
  level: UserLevelSchema,
  source: LevelSourceSchema,
});
export type DBUserLevel = z.infer<typeof dbUserLevelSchema>;

export const userLevelsRelations = relations(userLevelsTable, ({ one }) => ({
  course: one(coursesTable, {
    fields: [userLevelsTable.courseId],
    references: [coursesTable.id],
  }),
}));
```

Add `desc` to the `drizzle-orm` import if absent.

- [ ] **Step 4: Write the migration `src/db/migrate-user-levels.ts`**

```ts
/**
 * Idempotent migration for per-course user levels.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole schema
 * and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-user-levels
 */
import { sql } from 'drizzle-orm';
import { db } from './index';

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
```

Check the `db` import path against `src/db/migrate-user-management.ts` and match it exactly.

- [ ] **Step 5: Add the script to `package.json`**

Beside the other `db:migrate-*` entries:

```json
"db:migrate-user-levels": "dotenv -e .env.local -- tsx src/db/migrate-user-levels.ts",
```

- [ ] **Step 6: Run the migration and verify**

```bash
pnpm db:migrate-user-levels
pnpm db:migrate-user-levels   # second run must be a clean no-op
```

Expected: first run creates and reports a backfill count; second run reports `Backfilled 0`. Then confirm it type-checks:

```bash
pnpm check
```

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/db/schema.ts src/db/migrate-user-levels.ts package.json
git commit -m "feat(levels): add user_levels table and lessons.levels column"
```

---

### Task 2: The `user_levels` data layer

**Files:**
- Create: `src/db/user-levels.ts`
- Test: `src/lib/__tests__/tier-completion.test.ts` covers the pure logic in Task 4; this task's DB functions are exercised through the route tests in Tasks 8 and 11.

**Interfaces:**
- Consumes: `userLevelsTable`, `UserLevel`, `LevelSource` from Task 1.
- Produces:
  ```ts
  getCurrentLevel(userId: string, courseId: number): Promise<UserLevel>
  listLevelHistory(userId: string, courseId: number): Promise<DBUserLevel[]>
  insertLevelRow(input: InsertLevelRow): Promise<void>
  ensureEnrolmentLevel(userId: string, courseId: number): Promise<void>
  getUnacknowledgedAdminChange(userId, courseId): Promise<DBUserLevel | null>
  acknowledgeLevelRow(userId: string, rowId: number): Promise<void>
  ```

- [ ] **Step 1: Write the file**

```ts
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { type DBUserLevel, userLevelsTable } from '#/db/schema';
import type { LevelSource, UserLevel } from '#/types';
import { db } from './index';

export type InsertLevelRow = {
  userId: string;
  courseId: number;
  level: UserLevel;
  source: LevelSource;
  message?: string | null;
  note?: string | null;
  changedBy?: string | null;
};

/**
 * The pilot's level in one course — the newest row.
 *
 * Falls back to 'basic' rather than throwing. `ensureEnrolmentLevel` means an
 * enrolled pilot always has a row, so the fallback only fires for a course
 * they are not enrolled in, where 'basic' is the harmless answer.
 */
export async function getCurrentLevel(
  userId: string,
  courseId: number,
): Promise<UserLevel> {
  const [row] = await db
    .select({ level: userLevelsTable.level })
    .from(userLevelsTable)
    .where(
      and(
        eq(userLevelsTable.userId, userId),
        eq(userLevelsTable.courseId, courseId),
      ),
    )
    .orderBy(desc(userLevelsTable.createdAt), desc(userLevelsTable.id))
    .limit(1);
  return row?.level ?? 'basic';
}

/** Full history for one (user, course), newest first. */
export async function listLevelHistory(
  userId: string,
  courseId: number,
): Promise<DBUserLevel[]> {
  return db
    .select()
    .from(userLevelsTable)
    .where(
      and(
        eq(userLevelsTable.userId, userId),
        eq(userLevelsTable.courseId, courseId),
      ),
    )
    .orderBy(desc(userLevelsTable.createdAt), desc(userLevelsTable.id));
}

/** Append a row. Never updates — a correction is a newer row. */
export async function insertLevelRow(input: InsertLevelRow): Promise<void> {
  await db.insert(userLevelsTable).values({
    userId: input.userId,
    courseId: input.courseId,
    level: input.level,
    source: input.source,
    message: input.message ?? null,
    note: input.note ?? null,
    changedBy: input.changedBy ?? null,
  });
}

/**
 * Write the starting Basic row, once.
 *
 * Conditional on there being no rows at all — not on the absence of an
 * 'enrolment' row — so that unenrolling and re-enrolling an Advanced pilot
 * does not walk them back to Basic.
 */
export async function ensureEnrolmentLevel(
  userId: string,
  courseId: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO user_levels (user_id, course_id, level, source)
    SELECT ${userId}, ${courseId}, 'basic', 'enrolment'
    WHERE NOT EXISTS (
      SELECT 1 FROM user_levels
      WHERE user_id = ${userId} AND course_id = ${courseId}
    )
  `);
}

/**
 * The newest row, if it was written by an admin and the pilot has not yet
 * dismissed it. Drives the between-visits notice.
 */
export async function getUnacknowledgedAdminChange(
  userId: string,
  courseId: number,
): Promise<DBUserLevel | null> {
  const [row] = await db
    .select()
    .from(userLevelsTable)
    .where(
      and(
        eq(userLevelsTable.userId, userId),
        eq(userLevelsTable.courseId, courseId),
      ),
    )
    .orderBy(desc(userLevelsTable.createdAt), desc(userLevelsTable.id))
    .limit(1);
  if (!row) return null;
  if (row.source !== 'admin') return null;
  if (row.acknowledgedAt !== null) return null;
  return row;
}

/** Stamp a row as seen. Scoped by userId so one pilot cannot dismiss another's. */
export async function acknowledgeLevelRow(
  userId: string,
  rowId: number,
): Promise<void> {
  await db
    .update(userLevelsTable)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(userLevelsTable.id, rowId),
        eq(userLevelsTable.userId, userId),
        isNull(userLevelsTable.acknowledgedAt),
      ),
    );
}
```

- [ ] **Step 2: Wire `ensureEnrolmentLevel` into every enrolment path**

There are three entrances. All must go through the helper.

In `src/db/users.ts`, `addUserEnrolment` (line ~130) — after the insert:

```ts
export async function addUserEnrolment(options: {
  userId: string;
  courseId: number;
  grantedBy: string;
}): Promise<void> {
  await db
    .insert(courseSubscriptionsTable)
    .values({
      userId: options.userId,
      courseId: options.courseId,
      grantedBy: options.grantedBy,
    })
    .onConflictDoNothing({
      target: [courseSubscriptionsTable.userId, courseSubscriptionsTable.courseId],
    });
  // A pilot with an entitlement but no level row renders an empty course with
  // no error anywhere, so the level row is part of enrolling, not a side task.
  await ensureEnrolmentLevel(options.userId, options.courseId);
}
```

In `src/db/pending-enrolments.ts`, `claimPendingEnrolments` — inside the existing transaction, after the bulk `insert(courseSubscriptionsTable)` and before the `claimedAt` stamp:

```ts
    for (const row of pending) {
      await tx.execute(sql`
        INSERT INTO user_levels (user_id, course_id, level, source)
        SELECT ${options.userId}, ${row.courseId}, 'basic', 'enrolment'
        WHERE NOT EXISTS (
          SELECT 1 FROM user_levels
          WHERE user_id = ${options.userId} AND course_id = ${row.courseId}
        )
      `);
    }
```

(Inlined rather than calling the helper because it must run on the transaction handle `tx`, not the pool.)

- [ ] **Step 3: Verify it compiles and nothing regressed**

```bash
pnpm check && pnpm test
```

Expected: PASS, no new failures.

- [ ] **Step 4: Commit**

```bash
git add src/db/user-levels.ts src/db/users.ts src/db/pending-enrolments.ts
git commit -m "feat(levels): user_levels data layer, written on every enrolment path"
```

---

# Phase 2 — Visibility

### Task 3: Level-visibility pure functions

**Files:**
- Create: `src/lib/level-visibility.ts`
- Create: `src/lib/level-labels.ts`
- Test: `src/lib/__tests__/level-visibility.test.ts`

**Interfaces:**
- Produces:
  ```ts
  isLessonVisibleAtLevel(levels: readonly string[], level: UserLevel): boolean
  filterCourseToLevel<C extends LevelFilterableCourse>(course: C, level: UserLevel): C
  LEVEL_LABELS: Record<UserLevel, string>
  levelLabel(level: UserLevel): string
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/level-visibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  filterCourseToLevel,
  isLessonVisibleAtLevel,
} from '#/lib/level-visibility';

describe('isLessonVisibleAtLevel', () => {
  it('shows an untagged lesson to every tier', () => {
    expect(isLessonVisibleAtLevel([], 'basic')).toBe(true);
    expect(isLessonVisibleAtLevel([], 'intermediate')).toBe(true);
    expect(isLessonVisibleAtLevel([], 'advanced')).toBe(true);
  });

  it('matches exactly — advanced does not inherit basic', () => {
    expect(isLessonVisibleAtLevel(['basic'], 'advanced')).toBe(false);
    expect(isLessonVisibleAtLevel(['basic'], 'basic')).toBe(true);
  });

  it('honours a multi-tier tag', () => {
    const tag = ['intermediate', 'advanced'];
    expect(isLessonVisibleAtLevel(tag, 'basic')).toBe(false);
    expect(isLessonVisibleAtLevel(tag, 'intermediate')).toBe(true);
    expect(isLessonVisibleAtLevel(tag, 'advanced')).toBe(true);
  });
});

describe('filterCourseToLevel', () => {
  const course = {
    modules: [
      {
        slug: 'm1',
        lessons: [
          { slug: 'a', levels: ['basic'] },
          { slug: 'b', levels: [] },
          { slug: 'c', levels: ['intermediate'] },
        ],
      },
      {
        slug: 'm2',
        lessons: [{ slug: 'd', levels: ['basic'] }],
      },
    ],
  };

  it('keeps only lessons visible at the level', () => {
    const filtered = filterCourseToLevel(course, 'intermediate');
    expect(filtered.modules[0].lessons.map((l) => l.slug)).toEqual(['b', 'c']);
  });

  it('drops a module with no visible lessons entirely', () => {
    const filtered = filterCourseToLevel(course, 'intermediate');
    expect(filtered.modules.map((m) => m.slug)).toEqual(['m1']);
  });

  it('does not mutate the input', () => {
    filterCourseToLevel(course, 'advanced');
    expect(course.modules).toHaveLength(2);
    expect(course.modules[0].lessons).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test src/lib/__tests__/level-visibility.test.ts
```

Expected: FAIL — `Failed to resolve import "#/lib/level-visibility"`.

- [ ] **Step 3: Write `src/lib/level-visibility.ts`**

```ts
import type { UserLevel } from '#/types';

export type LevelFilterableLesson = { levels: readonly string[] };
export type LevelFilterableModule<L> = { lessons: readonly L[] };
export type LevelFilterableCourse<L, M extends LevelFilterableModule<L>> = {
  modules: readonly M[];
};

/**
 * Exact match, with empty meaning "every tier".
 *
 * Not a ceiling: an `advanced` pilot does not see a `['basic']` lesson. That is
 * the whole point of the model — see the spec's §3.
 */
export function isLessonVisibleAtLevel(
  levels: readonly string[],
  level: UserLevel,
): boolean {
  return levels.length === 0 || levels.includes(level);
}

/**
 * Narrow a course payload to what one pilot may see.
 *
 * Modules left with no visible lessons are dropped, not rendered empty — an
 * empty module is just a place for the question "why is this empty?" to form.
 *
 * Returns a new object. Callers pass this to the prerequisite engine so that
 * hidden lessons cannot gate visible ones ("filter first, then gate").
 *
 * NOTE: this must never be the only level check. Removing a lesson from the
 * payload makes `evaluateLessonLock` fail to `locate()` it, and that function
 * answers `{kind:'open'}` for unknown lessons — permissive. The fail-closed
 * check lives in `evaluateLessonGate`.
 */
export function filterCourseToLevel<
  L extends LevelFilterableLesson,
  M extends LevelFilterableModule<L>,
  C extends { modules: readonly M[] },
>(course: C, level: UserLevel): C {
  const modules = course.modules
    .map((mod) => ({
      ...mod,
      lessons: mod.lessons.filter((lesson) =>
        isLessonVisibleAtLevel(lesson.levels, level),
      ),
    }))
    .filter((mod) => mod.lessons.length > 0);
  return { ...course, modules };
}
```

- [ ] **Step 4: Write `src/lib/level-labels.ts`**

```ts
import { type UserLevel, USER_LEVELS } from '#/types';

/**
 * Pilot-facing names, kept apart from the stored values.
 *
 * The stored strings are an internal contract; these are shown to adult
 * professional pilots. Renaming must be a one-line change here, never a
 * migration.
 */
export const LEVEL_LABELS: Record<UserLevel, string> = {
  basic: 'Basic',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export function levelLabel(level: UserLevel): string {
  return LEVEL_LABELS[level];
}

/** Rung index, for ordering and for finding the next tier up. */
export function levelIndex(level: UserLevel): number {
  return USER_LEVELS.indexOf(level);
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm test src/lib/__tests__/level-visibility.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/level-visibility.ts src/lib/level-labels.ts src/lib/__tests__/level-visibility.test.ts
git commit -m "feat(levels): exact-match visibility and course filtering"
```

---

### Task 4: Tier-completion logic

**Files:**
- Create: `src/lib/tier-completion.ts`
- Test: `src/lib/__tests__/tier-completion.test.ts`

**Interfaces:**
- Consumes: `isLessonVisibleAtLevel` (Task 3), `levelIndex` (Task 3).
- Produces:
  ```ts
  nextLevel(level: UserLevel): UserLevel | null
  isTierComplete(input: TierCompletionInput): boolean
  type TierCompletionInput = {
    lessons: readonly { lessonId: number; levels: readonly string[]; isAvailable: boolean }[];
    progress: readonly { lessonId: number; percent: number }[];
    level: UserLevel;
  }
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/tier-completion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isTierComplete, nextLevel } from '#/lib/tier-completion';

describe('nextLevel', () => {
  it('walks the ladder one rung at a time', () => {
    expect(nextLevel('basic')).toBe('intermediate');
    expect(nextLevel('intermediate')).toBe('advanced');
  });

  it('has nothing above advanced', () => {
    expect(nextLevel('advanced')).toBeNull();
  });
});

describe('isTierComplete', () => {
  const lessons = [
    { lessonId: 1, levels: ['basic'], isAvailable: true },
    { lessonId: 2, levels: [], isAvailable: true },
    { lessonId: 3, levels: ['intermediate'], isAvailable: true },
    { lessonId: 4, levels: ['basic'], isAvailable: false },
  ];

  it('is true when every reachable lesson at the tier is 100%', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 100 },
          { lessonId: 3, percent: 0 },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('counts untagged lessons into the current tier', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 40 },
        ],
        level: 'basic',
      }),
    ).toBe(false);
  });

  it('ignores unavailable lessons, so WIP content cannot deadlock a pilot', () => {
    expect(
      isTierComplete({
        lessons,
        progress: [
          { lessonId: 1, percent: 100 },
          { lessonId: 2, percent: 100 },
          { lessonId: 4, percent: 0 },
        ],
        level: 'basic',
      }),
    ).toBe(true);
  });

  it('treats a lesson with no progress row as incomplete', () => {
    expect(
      isTierComplete({ lessons, progress: [], level: 'basic' }),
    ).toBe(false);
  });

  it('is false when the tier has no reachable lessons at all', () => {
    expect(
      isTierComplete({
        lessons: [{ lessonId: 9, levels: ['advanced'], isAvailable: true }],
        progress: [{ lessonId: 9, percent: 100 }],
        level: 'basic',
      }),
    ).toBe(false);
  });
});
```

The last case matters: an empty tier is **not** complete. If it were, a pilot in a course with no Basic lessons would be promoted instantly and repeatedly on every progress write.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test src/lib/__tests__/tier-completion.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/tier-completion.ts`**

```ts
import { levelIndex } from '#/lib/level-labels';
import { isLessonVisibleAtLevel } from '#/lib/level-visibility';
import { type UserLevel, USER_LEVELS } from '#/types';

export type TierCompletionInput = {
  lessons: readonly {
    lessonId: number;
    levels: readonly string[];
    isAvailable: boolean;
  }[];
  /** From `getCourseProgress`. `percent === 100` is the definition of done. */
  progress: readonly { lessonId: number; percent: number }[];
  level: UserLevel;
};

/** The rung above this one, or null at the top. */
export function nextLevel(level: UserLevel): UserLevel | null {
  return USER_LEVELS[levelIndex(level) + 1] ?? null;
}

/**
 * Has the pilot finished every lesson they can reach at their current tier?
 *
 * "Finished" reuses the app's existing definition — `lessonPercent === 100`
 * from `aggregateCourseProgress` — rather than inventing a second, stricter
 * notion. Note this is deliberately NOT `watched`, which is weaker and is what
 * the prerequisite gate uses.
 *
 * An empty tier returns false. Otherwise a course with no lessons at a tier
 * would promote the pilot on every single progress write, forever.
 */
export function isTierComplete(input: TierCompletionInput): boolean {
  const percentByLesson = new Map(
    input.progress.map((p) => [p.lessonId, p.percent]),
  );

  const reachable = input.lessons.filter(
    (lesson) =>
      lesson.isAvailable && isLessonVisibleAtLevel(lesson.levels, input.level),
  );

  if (reachable.length === 0) return false;

  return reachable.every(
    (lesson) => (percentByLesson.get(lesson.lessonId) ?? 0) === 100,
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test src/lib/__tests__/tier-completion.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tier-completion.ts src/lib/__tests__/tier-completion.test.ts
git commit -m "feat(levels): tier-completion predicate"
```

---

### Task 5: Carry `levels` through the payload

**Files:**
- Modify: `src/db/course.ts` (select at ~line 81-108; cache prefix at ~line 193)
- Modify: `src/lib/course-details-shape.ts` (`LearnerCourseLesson`, ~line 102)
- Modify: `src/lib/lesson-gating-inputs.ts` (`DetailsLesson` line 8; `toGateCourse` line 29)
- Modify: `src/lib/lesson-gating.ts` (`GateLesson` type, ~line 20)
- Modify: `src/db/admin.ts` (`getCourseBoard` select ~line 427, map ~line 501)
- Modify: `src/lib/admin-schemas.ts` (`boardLessonSchema` ~line 84)

**Interfaces:**
- Consumes: `lessonsTable.levels` (Task 1).
- Produces: `levels: readonly string[]` present on `DetailsLesson`, `GateLesson`, `LearnerCourseLesson`, and `BoardLesson`.

- [ ] **Step 1: Add `levels` to the course-details query**

In `src/db/course.ts`, the lessons select (~line 81) — add alongside `requiredSubscriptions`:

```ts
      levels: lessonsTable.levels,
```

and make sure the restructure into `lessonMap` (~line 112) carries it onto each lesson object.

- [ ] **Step 2: Bump the Redis cache prefix — this is not optional**

`src/db/course.ts` ~line 193:

```ts
export const getCourseDetailsWithCache = cacheWithRedis<string, CourseDetails>(
  'course-details-v4',
  getCourseDetails,
);
```

The file's own comment explains why: a cached `v3` entry deserialises with `levels` undefined, `isLessonVisibleAtLevel(undefined, …)` throws or — worse — a defaulted `[]` opens every gate. Bumping the prefix orphans the old entries rather than reading them.

- [ ] **Step 3: Declare it on the learner-facing type**

`src/lib/course-details-shape.ts`, in `LearnerCourseLesson` (~line 102):

```ts
  /** Tiers that see this lesson. Empty means all. */
  levels: readonly string[];
```

Leave `toLearnerCourseDetails` alone — it strips fields by omission, and `levels` must survive to the client so the sidebar can filter.

- [ ] **Step 4: Thread it into the gating types**

`src/lib/lesson-gating-inputs.ts` — add to `DetailsLesson` (line 8):

```ts
  levels: readonly string[];
```

and to the per-lesson projection inside `toGateCourse` (~line 40):

```ts
        levels: lesson.levels ?? [],
```

`src/lib/lesson-gating.ts` — add to `GateLesson` (~line 20):

```ts
  /**
   * Tiers that see this lesson; empty means all.
   *
   * Carried on the gate type so that a level-filtered GateCourse and an
   * unfiltered one are the same shape — the filter is applied by the caller,
   * not by the predicate.
   */
  levels: readonly string[];
```

Do **not** change `isLessonSatisfied` or `canBlock`. They operate on the already-filtered set.

- [ ] **Step 5: Add it to the admin board**

`src/db/admin.ts` — `getCourseBoard` select (~line 427) add `levels: lessonsTable.levels`, and carry it in the map at ~line 501.

`src/lib/admin-schemas.ts` — `boardLessonSchema` (~line 84), add beside `requiredSubscriptions`:

```ts
  levels: UserLevelsSchema,
```

importing `UserLevelsSchema` from `#/types`.

- [ ] **Step 6: Verify**

```bash
pnpm check && pnpm test
```

Expected: PASS. If existing gating tests fail on a missing `levels` field in their fixtures, add `levels: []` to those fixtures — that is the correct "visible to all" default and preserves their meaning.

- [ ] **Step 7: Commit**

```bash
git add src/db/course.ts src/db/admin.ts src/lib/course-details-shape.ts src/lib/lesson-gating-inputs.ts src/lib/lesson-gating.ts src/lib/admin-schemas.ts
git commit -m "feat(levels): carry lesson levels through course, gate and board payloads"
```

---

### Task 6: Enforce visibility in the gate

**Files:**
- Modify: `src/lib/lesson-gating.server.ts` (line 19 type, line 38 function)
- Test: `src/lib/__tests__/lesson-gating-level.test.ts`

**Interfaces:**
- Consumes: `getCurrentLevel` (Task 2), `filterCourseToLevel` / `isLessonVisibleAtLevel` (Task 3).
- Produces: `LessonGateResult` gains `level: UserLevel` and `outOfTier: null | { readOnly: boolean }`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/lesson-gating-level.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCourseSlugForLesson: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getCurrentLevel: vi.fn(),
}));

vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForLesson: m.getCourseSlugForLesson,
  isSubscribedToCourse: m.isSubscribedToCourse,
}));
vi.mock('#/db/permissions', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: m.getCurrentLevel }));

import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const DETAILS = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module 1',
      dependsOn: [],
      sequentialLessons: true,
      lessons: [
        {
          id: 10, slug: 'basic-1', name: 'Basic 1', isAvailable: true,
          hasVideo: true, needsVideoWatch: true, dependsOn: [], levels: ['basic'],
        },
        {
          id: 11, slug: 'inter-1', name: 'Inter 1', isAvailable: true,
          hasVideo: true, needsVideoWatch: true, dependsOn: [],
          levels: ['intermediate'],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseSlugForLesson.mockResolvedValue({
    courseSlug: 'c1', courseId: 7, isAvailable: true,
  });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
});

describe('level enforcement', () => {
  it('opens a lesson at the pilot’s own tier', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'inter-1' });
    expect(result?.outOfTier).toBeNull();
  });

  it('marks an out-of-tier lesson out of tier, not open', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });
    expect(result?.outOfTier).not.toBeNull();
  });

  it('makes an out-of-tier lesson read-only when it was completed', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 10, moduleId: 1, percent: 100, watched: true }],
    });
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });
    expect(result?.outOfTier).toEqual({ readOnly: true });
  });

  it('refuses an out-of-tier lesson that was never completed', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 10, moduleId: 1, percent: 60, watched: false }],
    });
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });
    expect(result?.outOfTier).toEqual({ readOnly: false });
  });

  it('does not let a hidden lesson gate a visible one', async () => {
    // inter-1 sits after basic-1 in a sequential module. An intermediate pilot
    // has never watched basic-1, so an unfiltered gate would lock inter-1.
    m.getCurrentLevel.mockResolvedValue('intermediate');
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'inter-1' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });

  it('reports the level so callers can name it in copy', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'inter-1' });
    expect(result?.level).toBe('advanced');
  });
});
```

Check the real import paths of `getCourseSlugForLesson`, `getUserRoleNames`, `isSubscribedToCourse` and `getCourseProgress` against the top of `src/lib/lesson-gating.server.ts` and correct the `vi.mock` paths to match exactly — a wrong path silently mocks nothing.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test src/lib/__tests__/lesson-gating-level.test.ts
```

Expected: FAIL — `outOfTier` is undefined, and the hidden-gate case locks.

- [ ] **Step 3: Implement in `src/lib/lesson-gating.server.ts`**

Extend the result type (line 19):

```ts
export type LessonGateResult = {
  courseSlug: string;
  courseId: number;
  isAdmin: boolean;
  subscribed: boolean;
  /** The pilot's tier in this course, for copy that has to name it. */
  level: UserLevel;
  /**
   * Null when the lesson is in the pilot's tier.
   *
   * Otherwise `readOnly` says whether they completed it before moving on:
   * out-of-tier content you've done is read-only, out-of-tier content you
   * haven't is not yours.
   */
  outOfTier: null | { readOnly: boolean };
  lessonLock: LessonLock;
  materialLock: MaterialLock;
};
```

And the function body, after the `details` null-check and the admin short-circuit:

```ts
  const isAdmin = hasAdminAccess(roles);
  if (isAdmin) {
    return {
      ...course,
      isAdmin: true,
      subscribed: true,
      level: 'advanced',
      outOfTier: null,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  const subscribed = await isSubscribedToCourse(userId, course.courseId);
  const level = await getCurrentLevel(userId, course.courseId);

  // Fail closed. This check must NOT be done by filtering the payload: an
  // absent lesson makes `evaluateLessonLock` fail to locate it, and that
  // function answers `open` for unknown lessons.
  const target = details.modules
    .flatMap((mod) => mod.lessons)
    .find((l) => l.slug === lessonSlug);

  if (target && !isLessonVisibleAtLevel(target.levels ?? [], level)) {
    const done = progress.lessons.some(
      (l) => l.lessonId === target.id && l.percent === 100,
    );
    return {
      ...course,
      isAdmin: false,
      subscribed,
      level,
      outOfTier: { readOnly: done },
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  // Filter first, then gate — so hidden lessons never gate visible ones.
  const gateCourse = toGateCourse(filterCourseToLevel(details, level));
  const watched = watchedLessonSlugs(details, progress);

  return {
    ...course,
    isAdmin: false,
    subscribed,
    level,
    outOfTier: null,
    lessonLock: evaluateLessonLock(gateCourse, lessonSlug, watched),
    materialLock: evaluateMaterialLock(gateCourse, lessonSlug, watched),
  };
```

Add imports: `getCurrentLevel` from `#/db/user-levels`, `filterCourseToLevel` and `isLessonVisibleAtLevel` from `#/lib/level-visibility`, `UserLevel` from `#/types`.

Note `watchedLessonSlugs` is deliberately computed from the **unfiltered** `details` — a hidden completed lesson still counts as watched if a visible lesson explicitly depends on it.

- [ ] **Step 4: Run the tests**

```bash
pnpm test src/lib/__tests__/lesson-gating-level.test.ts
pnpm test
```

Expected: 6 new tests PASS; whole suite PASS.

- [ ] **Step 5: Handle `outOfTier` at the material route**

`src/routes/api/lesson/material.ts` — where the handler currently branches on `lockedResponse(...)`, add before it:

```ts
  if (gate.outOfTier) {
    if (!gate.outOfTier.readOnly) {
      return Response.json(
        { error: 'out-of-tier', level: gate.level },
        { status: 403 },
      );
    }
    // Completed at an earlier tier: serve the material, but never record a
    // fresh visit — this is a read-only archive view, not attendance.
    const material = await getLessonMaterial(lessonSlug);
    return Response.json({
      locked: false,
      adminBypass: false,
      readOnly: true,
      material,
    });
  }
```

Match `getLessonMaterial`'s real name and signature to what the handler already calls further down.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lesson-gating.server.ts src/routes/api/lesson/material.ts src/lib/__tests__/lesson-gating-level.test.ts
git commit -m "feat(levels): enforce exact-match visibility in the lesson gate"
```

---

### Task 7: Filter the learner's course tree

**Files:**
- Modify: `src/components/sidebar/course-sidebar-wrapper.tsx` (~line 29-80)
- Create: `src/data-hooks/use-my-level.ts`
- Create: `src/routes/api/user/my-level.ts`
- Test: `src/components/sidebar/__tests__/compute-lesson-locks.test.ts` — extend if it exists, else create

**Interfaces:**
- Consumes: `filterCourseToLevel` (Task 3), `getCurrentLevel` (Task 2).
- Produces: `useMyLevel(courseSlug)` returning `{ level, pendingChange }`.

- [ ] **Step 1: Create the read endpoint `src/routes/api/user/my-level.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getCourseIdBySlug } from '#/db/course';
import {
  getCurrentLevel,
  getUnacknowledgedAdminChange,
} from '#/db/user-levels';
import { requireSession } from '#/lib/auth-context.server';

export async function getMyLevelHandler(request: Request): Promise<Response> {
  const session = await requireSession(request.headers);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return Response.json({ error: 'slug required' }, { status: 400 });

  const courseId = await getCourseIdBySlug(slug);
  if (courseId === null) {
    return Response.json({ error: 'Course not found' }, { status: 404 });
  }

  const [level, pending] = await Promise.all([
    getCurrentLevel(session.userId, courseId),
    getUnacknowledgedAdminChange(session.userId, courseId),
  ]);

  return Response.json({
    level,
    pendingChange: pending
      ? { id: pending.id, level: pending.level, message: pending.message }
      : null,
  });
}

export const Route = createFileRoute('/api/user/my-level')({
  server: { handlers: { GET: ({ request }) => getMyLevelHandler(request) } },
});
```

Match `requireSession`'s real name/signature to the other `src/routes/api/user/*` handlers, and add `getCourseIdBySlug` to `src/db/course.ts` if it does not exist:

```ts
export async function getCourseIdBySlug(slug: string): Promise<number | null> {
  const [row] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.slug, slug))
    .limit(1);
  return row?.id ?? null;
}
```

- [ ] **Step 2: Create the hook `src/data-hooks/use-my-level.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';
import { UserLevelSchema } from '#/types';

const myLevelSchema = z.object({
  level: UserLevelSchema,
  pendingChange: z
    .object({
      id: z.number(),
      level: UserLevelSchema,
      message: z.string().nullable(),
    })
    .nullable(),
});

export type MyLevel = z.infer<typeof myLevelSchema>;

export function useMyLevel(courseSlug: string) {
  return useQuery({
    queryKey: dataKeys.myLevel(courseSlug),
    queryFn: async (): Promise<MyLevel> => {
      const res = await fetch(
        `/api/user/my-level?slug=${encodeURIComponent(courseSlug)}`,
      );
      if (!res.ok) throw new Error('Could not load your level');
      return myLevelSchema.parse(await res.json());
    },
    staleTime: 60_000,
  });
}

export function useAcknowledgeLevelChange(courseSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: number) => {
      const res = await fetch('/api/user/level-acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId }),
      });
      if (!res.ok) throw new Error('Could not dismiss');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.myLevel(courseSlug) });
    },
  });
}
```

Add to `src/data-hooks/keys.ts`:

```ts
  myLevel: (slug: string) => ['my-level', slug] as const,
```

- [ ] **Step 3: Create `src/routes/api/user/level-acknowledge.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { acknowledgeLevelRow } from '#/db/user-levels';
import { requireSession } from '#/lib/auth-context.server';

const bodySchema = z.object({ rowId: z.number().int().positive() });

export async function postLevelAcknowledgeHandler(
  request: Request,
): Promise<Response> {
  const session = await requireSession(request.headers);
  if (!session) return new Response('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Scoped by userId inside the query, so one pilot cannot dismiss another's.
  await acknowledgeLevelRow(session.userId, parsed.data.rowId);
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/user/level-acknowledge')({
  server: {
    handlers: { POST: ({ request }) => postLevelAcknowledgeHandler(request) },
  },
});
```

- [ ] **Step 4: Filter the sidebar**

In `src/components/sidebar/course-sidebar-wrapper.tsx`, after the existing `detailsQuery`/`progressQuery`:

```tsx
  const levelQuery = useMyLevel(courseSlug);

  // Filter before locks are computed, so a hidden lesson never appears as the
  // blocker in a lock reason the pilot cannot act on.
  const visibleDetails = useMemo(() => {
    if (!detailsQuery.data || !levelQuery.data) return detailsQuery.data;
    if (isAdmin) return detailsQuery.data;
    return filterCourseToLevel(detailsQuery.data, levelQuery.data.level);
  }, [detailsQuery.data, levelQuery.data, isAdmin]);
```

Then replace every downstream use of `detailsQuery.data` with `visibleDetails`, including the `computeLessonLocks(...)` call.

Admins bypass the filter, matching `evaluateLessonGate`'s existing admin short-circuit.

- [ ] **Step 5: Verify manually**

```bash
pnpm dev
```

Note: `package.json` starts vite on port 5000, but port 5000 is macOS Control Center and answers 403 — use **5001** if 5000 misbehaves. Then in the DB, tag one lesson `levels = '{intermediate}'` and confirm a Basic pilot no longer sees it and its module disappears if it was the only lesson.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/user/my-level.ts src/routes/api/user/level-acknowledge.ts src/data-hooks/use-my-level.ts src/data-hooks/keys.ts src/components/sidebar/course-sidebar-wrapper.tsx src/db/course.ts
git commit -m "feat(levels): filter the learner course tree by level"
```

---

# Phase 3 — Promotion

### Task 8: The promotion writer

**Files:**
- Create: `src/lib/promotion.server.ts`
- Modify: `src/routes/api/user/lesson-section.ts`
- Modify: `src/routes/api/user/report-video-progress.ts`
- Modify: the quiz-submit and debrief `save-results` handlers under `src/routes/api/lesson/`
- Test: `src/lib/__tests__/promotion.test.ts`

**Interfaces:**
- Consumes: `getCurrentLevel`, `insertLevelRow` (Task 2); `isTierComplete`, `nextLevel` (Task 4); `getCourseProgress`.
- Produces: `maybePromote({ userId, courseSlug }): Promise<{ from: UserLevel; to: UserLevel } | null>`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/promotion.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getCurrentLevel: vi.fn(),
  insertLevelRow: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getCourseIdBySlug: vi.fn(),
  sendLevelPromotionEmail: vi.fn(),
  getUserEmail: vi.fn(),
}));

vi.mock('#/db/user-levels', () => ({
  getCurrentLevel: m.getCurrentLevel,
  insertLevelRow: m.insertLevelRow,
}));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
  getCourseIdBySlug: m.getCourseIdBySlug,
}));
vi.mock('#/db/course-progress', () => ({ getCourseProgress: m.getCourseProgress }));
vi.mock('#/lib/email/send-level-promotion-email', () => ({
  sendLevelPromotionEmail: m.sendLevelPromotionEmail,
}));
vi.mock('#/db/user-profile', () => ({ getUserEmail: m.getUserEmail }));

import { maybePromote } from '#/lib/promotion.server';

const DETAILS = {
  name: 'RT Course',
  modules: [
    {
      lessons: [
        { id: 1, isAvailable: true, levels: ['basic'] },
        { id: 2, isAvailable: true, levels: ['intermediate'] },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdBySlug.mockResolvedValue(7);
  m.getCourseDetailsWithCache.mockResolvedValue(DETAILS);
  m.getUserEmail.mockResolvedValue('pilot@example.com');
  m.sendLevelPromotionEmail.mockResolvedValue(undefined);
});

describe('maybePromote', () => {
  it('writes the next rung when the tier is finished', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });

    const result = await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(result).toEqual({ from: 'basic', to: 'intermediate' });
    expect(m.insertLevelRow).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      level: 'intermediate',
      source: 'earned',
    });
  });

  it('writes nothing when the tier is unfinished', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 50 }],
    });

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('short-circuits at the top rung without querying progress', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');

    expect(await maybePromote({ userId: 'u1', courseSlug: 'rt' })).toBeNull();
    expect(m.getCourseProgress).not.toHaveBeenCalled();
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('emails the pilot on promotion', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });

    await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(m.sendLevelPromotionEmail).toHaveBeenCalledWith({
      email: 'pilot@example.com',
      courseName: 'RT Course',
      level: 'intermediate',
    });
  });

  it('still reports the promotion when the email fails', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 1, percent: 100 }],
    });
    m.sendLevelPromotionEmail.mockRejectedValue(new Error('resend down'));

    const result = await maybePromote({ userId: 'u1', courseSlug: 'rt' });

    expect(result).toEqual({ from: 'basic', to: 'intermediate' });
    expect(m.insertLevelRow).toHaveBeenCalled();
  });
});
```

The last test is the important one: a mail outage must never swallow a promotion the pilot earned.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test src/lib/__tests__/promotion.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/promotion.server.ts`**

```ts
import { getCourseDetailsWithCache, getCourseIdBySlug } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { getUserEmail } from '#/db/user-profile';
import { getCurrentLevel, insertLevelRow } from '#/db/user-levels';
import { sendLevelPromotionEmail } from '#/lib/email/send-level-promotion-email';
import { isTierComplete, nextLevel } from '#/lib/tier-completion';
import type { UserLevel } from '#/types';

export type Promotion = { from: UserLevel; to: UserLevel };

/**
 * Promote the pilot if they have just finished their tier.
 *
 * Called after every progress write, because there is no single "lesson
 * completed" event — completion emerges from section taps, video milestones,
 * quiz submissions and debrief saves independently.
 *
 * Only ever writes upward. Recomputation that could write downward was
 * rejected: one new Basic lesson would demote every Advanced pilot at once and,
 * under exact-match visibility, empty their course.
 *
 * Returns the promotion so the calling route can put it in its response and
 * the UI can show the moment in-flow rather than the pilot discovering a
 * rearranged course on their next visit.
 */
export async function maybePromote(options: {
  userId: string;
  courseSlug: string;
}): Promise<Promotion | null> {
  const courseId = await getCourseIdBySlug(options.courseSlug);
  if (courseId === null) return null;

  const from = await getCurrentLevel(options.userId, courseId);
  const to = nextLevel(from);
  // Top of the ladder: skip the progress query entirely. This is what keeps
  // the check affordable on high-frequency video-milestone pings.
  if (to === null) return null;

  const [details, progress] = await Promise.all([
    getCourseDetailsWithCache(options.courseSlug),
    getCourseProgress({ userId: options.userId, slug: options.courseSlug }),
  ]);
  if (!details) return null;

  const lessons = details.modules.flatMap((mod) =>
    mod.lessons.map((lesson) => ({
      lessonId: lesson.id,
      levels: lesson.levels ?? [],
      isAvailable: lesson.isAvailable,
    })),
  );

  if (!isTierComplete({ lessons, progress: progress.lessons, level: from })) {
    return null;
  }

  await insertLevelRow({
    userId: options.userId,
    courseId,
    level: to,
    source: 'earned',
  });

  // Best-effort. The promotion is already durable; a mail outage must not
  // undo it or hide it from the response.
  try {
    const email = await getUserEmail(options.userId);
    if (email) {
      await sendLevelPromotionEmail({
        email,
        courseName: details.name,
        level: to,
      });
    }
  } catch (error) {
    console.error('Promotion email failed; the promotion stands.', error);
  }

  return { from, to };
}
```

Add `getUserEmail` to `src/db/user-profile.ts` if absent:

```ts
export async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: userProfileTable.email })
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId))
    .limit(1);
  return row?.email ?? null;
}
```

- [ ] **Step 4: Write the email template `src/lib/email/templates/level-promotion-email.ts`**

Mirror `src/lib/email/templates/otp-email.ts` exactly — same inline-styled table, same `{ subject, html }` return.

```ts
import { levelLabel } from '#/lib/level-labels';
import type { UserLevel } from '#/types';

interface LevelPromotionEmailProps {
  courseName: string;
  level: UserLevel;
  appName?: string;
}

export function levelPromotionEmailTemplate({
  courseName,
  level,
  appName = 'RMTP Studio',
}: LevelPromotionEmailProps): { subject: string; html: string } {
  const label = levelLabel(level);
  const subject = `You've reached ${label} in ${courseName}`;
  const heading = `You're now ${label}`;
  const body = `You've completed every lesson at your previous level in ${courseName}. Your ${label} lessons are now available.`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <tr><td style="font-size:20px;font-weight:600;color:#111111;padding-bottom:12px;">${heading}</td></tr>
        <tr><td style="font-size:15px;line-height:1.5;color:#444444;">${body}</td></tr>
        <tr><td style="font-size:13px;color:#888888;padding-top:24px;">${appName}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
```

- [ ] **Step 5: Write the sender `src/lib/email/send-level-promotion-email.ts`**

```ts
import { env } from '#/env';
import { getResendClient } from '#/lib/email/client';
import { levelPromotionEmailTemplate } from '#/lib/email/templates/level-promotion-email';
import type { UserLevel } from '#/types';

export async function sendLevelPromotionEmail(params: {
  email: string;
  courseName: string;
  level: UserLevel;
}): Promise<void> {
  // Same development escape hatch as sendOtpEmail's call site: no live sends
  // from a dev machine.
  if (process.env.NODE_ENV === 'development') {
    console.info(
      `[DEV] Promotion email to ${params.email}: ${params.level} in ${params.courseName}`,
    );
    return;
  }

  const { subject, html } = levelPromotionEmailTemplate({
    courseName: params.courseName,
    level: params.level,
  });

  const { error } = await getResendClient().emails.send({
    from: env.EMAIL_FROM,
    to: params.email,
    subject,
    html,
  });
  if (error) {
    throw new Error(`Failed to send promotion email: ${error.message}`);
  }
}
```

- [ ] **Step 6: Run the tests**

```bash
pnpm test src/lib/__tests__/promotion.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 7: Call `maybePromote` from every progress-writing route**

In `src/routes/api/user/lesson-section.ts`, after `recordLessonSectionTap`:

```ts
  const promotion = await maybePromote({
    userId: session.userId,
    courseSlug,
  });
  return Response.json({ ok: true, promotion });
```

Resolve `courseSlug` from the lesson slug using the existing `getCourseSlugForLesson` helper in `#/db/lesson-access`.

Do the same in `src/routes/api/user/report-video-progress.ts`, in the quiz-submit handler, and in the debrief `save-results` handler — each returning `promotion` in its JSON body.

Wrap each call so a promotion failure never fails the progress write:

```ts
  let promotion: Promotion | null = null;
  try {
    promotion = await maybePromote({ userId: session.userId, courseSlug });
  } catch (error) {
    console.error('Promotion check failed; progress was still recorded.', error);
  }
```

- [ ] **Step 8: Verify the whole suite**

```bash
pnpm check && pnpm test
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/promotion.server.ts src/lib/email src/db/user-profile.ts src/routes/api/user src/routes/api/lesson src/lib/__tests__/promotion.test.ts
git commit -m "feat(levels): promote on tier completion, with in-flow signal and email"
```

---

# Phase 4 — Admin

### Task 9: The `level` permission entity and API

**Files:**
- Modify: `src/lib/admin-schemas.ts` (`PERMISSION_ENTITIES` line 494, `GRANTABLE_PERMISSIONS` ~line 518)
- Create: `src/routes/api/admin/users.$profileId.levels.ts`
- Test: `src/routes/api/admin/__tests__/user-levels-route.test.ts`

**Interfaces:**
- Consumes: `listLevelHistory`, `insertLevelRow`, `getCurrentLevel` (Task 2); `requirePermission`, `assertCanActOnProfile`, `ForbiddenError`.
- Produces: `getUserLevelsHandler(request, profileIdRaw)`, `putUserLevelHandler(request, profileIdRaw)`, `setUserLevelInputSchema`.

- [ ] **Step 1: Add the entity**

`src/lib/admin-schemas.ts`:

```ts
/**
 * `level` is separate from `enrolment` on purpose: enrolling grants access to a
 * course, while setting a level changes which lessons inside it a pilot can
 * see — and, because the automatic path only writes upward, it is the only
 * correction mechanism in the system. Folding it into an existing entity would
 * grant that power silently to everyone who already holds it.
 */
export const PERMISSION_ENTITIES = ['user', 'enrolment', 'level'] as const;
```

```ts
export const GRANTABLE_PERMISSIONS: Record<
  PermissionEntity,
  readonly PermissionAction[]
> = {
  user: ['read', 'create', 'update'],
  enrolment: ['read', 'create', 'delete'],
  level: ['read', 'update'],
};
```

And the input schema, near `updateUserProfileInputSchema`:

```ts
/**
 * `message` is required and non-empty because it is shown to the pilot. `note`
 * is admin-only. Two fields so neither audience reads a sentence written for
 * the other.
 */
export const setUserLevelInputSchema = z
  .object({
    courseId: z.number().int().positive(),
    level: UserLevelSchema,
    message: z.string().trim().min(1, 'A message for the pilot is required'),
    note: z.string().trim().optional(),
  })
  .strict();
export type SetUserLevelInput = z.infer<typeof setUserLevelInputSchema>;
```

- [ ] **Step 2: Write the failing route test**

`src/routes/api/admin/__tests__/user-levels-route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requirePermission: vi.fn(),
    assertCanActOnProfile: vi.fn(),
    getUserProfile: vi.fn(),
    listLevelHistory: vi.fn(),
    insertLevelRow: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
  assertCanActOnProfile: m.assertCanActOnProfile,
}));
vi.mock('#/db/users', () => ({ getUserProfile: m.getUserProfile }));
vi.mock('#/db/user-levels', () => ({
  listLevelHistory: m.listLevelHistory,
  insertLevelRow: m.insertLevelRow,
}));

import {
  getUserLevelsHandler,
  putUserLevelHandler,
} from '../users.$profileId.levels';

const ACTOR = {
  userId: 'actor-1',
  roles: ['admin'],
  permissions: new Set<string>(),
  isOwner: false,
};

function req(body?: unknown, method = 'PUT'): Request {
  return new Request('http://t/x', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue(ACTOR);
  m.assertCanActOnProfile.mockResolvedValue(undefined);
  m.getUserProfile.mockResolvedValue({
    profileId: 5,
    userId: 'user-5',
    email: 'p@e.com',
  });
  m.listLevelHistory.mockResolvedValue([]);
});

describe('PUT /api/admin/users/:id/levels', () => {
  it('asks for level:update specifically', async () => {
    await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'Ex-instructor.' }),
      '5',
    );
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'level',
      'update',
    );
  });

  it('records the acting admin and the pilot-facing message', async () => {
    await putUserLevelHandler(
      req({
        courseId: 3,
        level: 'advanced',
        message: 'Ex-instructor.',
        note: 'Ticket 4412',
      }),
      '5',
    );
    expect(m.insertLevelRow).toHaveBeenCalledWith({
      userId: 'user-5',
      courseId: 3,
      level: 'advanced',
      source: 'admin',
      message: 'Ex-instructor.',
      note: 'Ticket 4412',
      changedBy: 'actor-1',
    });
  });

  it('refuses a change with no message for the pilot', async () => {
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: '   ' }),
      '5',
    );
    expect(res.status).toBe(400);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('accepts a demotion — it is the only correction path there is', async () => {
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'basic', message: 'Tagged in error, sorry.' }),
      '5',
    );
    expect(res.status).toBe(204);
    expect(m.insertLevelRow).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'basic' }),
    );
  });

  it('403s when denied', async () => {
    m.requirePermission.mockRejectedValue(new m.ForbiddenError());
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(403);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('refuses to act on a privileged target', async () => {
    m.assertCanActOnProfile.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(403);
    expect(m.insertLevelRow).not.toHaveBeenCalled();
  });

  it('404s an unknown profile', async () => {
    m.getUserProfile.mockResolvedValue(null);
    const res = await putUserLevelHandler(
      req({ courseId: 3, level: 'advanced', message: 'x' }),
      '5',
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/users/:id/levels', () => {
  it('asks for level:read', async () => {
    await getUserLevelsHandler(req(undefined, 'GET'), '5');
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'level',
      'read',
    );
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm test src/routes/api/admin/__tests__/user-levels-route.test.ts
```

Expected: FAIL — module `../users.$profileId.levels` not found.

- [ ] **Step 4: Write `src/routes/api/admin/users.$profileId.levels.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { insertLevelRow, listLevelHistory } from '#/db/user-levels';
import { getUserProfile } from '#/db/users';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setUserLevelInputSchema } from '#/lib/admin-schemas';
import {
  assertCanActOnProfile,
  requirePermission,
} from '#/lib/permissions.server';

export function parseProfileId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getUserLevelsHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    await requirePermission(request.headers, 'level', 'read');
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  const profile = await getUserProfile(profileId);
  if (!profile) return Response.json({ error: 'User not found' }, { status: 404 });

  const url = new URL(request.url);
  const courseIdRaw = url.searchParams.get('courseId');
  const courseId = courseIdRaw === null ? null : Number(courseIdRaw);
  if (courseId === null || !Number.isInteger(courseId)) {
    return Response.json({ error: 'courseId required' }, { status: 400 });
  }

  return Response.json({ history: await listLevelHistory(profile.userId, courseId) });
}

export async function putUserLevelHandler(
  request: Request,
  profileIdRaw: string,
): Promise<Response> {
  const profileId = parseProfileId(profileIdRaw);
  if (profileId === null) {
    return Response.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission(request.headers, 'level', 'update');
    await assertCanActOnProfile(actor, profileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = setUserLevelInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await getUserProfile(profileId);
  if (!profile) return Response.json({ error: 'User not found' }, { status: 404 });

  // Deliberately unconstrained: any level, any direction, any jump. The
  // automatic path only ever writes upward, so this is the only way to correct
  // a wrong level — including walking one back.
  await insertLevelRow({
    userId: profile.userId,
    courseId: parsed.data.courseId,
    level: parsed.data.level,
    source: 'admin',
    message: parsed.data.message,
    note: parsed.data.note,
    changedBy: actor.userId,
  });

  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/users/$profileId/levels')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getUserLevelsHandler(request, params.profileId),
      PUT: ({ request, params }) =>
        putUserLevelHandler(request, params.profileId),
    },
  },
});
```

Note `insertLevelRow` is called with `note: parsed.data.note` which is `string | undefined`; `insertLevelRow` already coalesces to `null`.

- [ ] **Step 5: Run the tests**

```bash
pnpm test src/routes/api/admin/__tests__/user-levels-route.test.ts
pnpm test
```

Expected: 8 new tests PASS; whole suite PASS. The existing `role-permissions` test that rejects an entity with no endpoint should still pass — `level` now *has* endpoints, so if that test used `level` as its negative case, change it to another unused entity.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-schemas.ts src/routes/api/admin/users.$profileId.levels.ts src/routes/api/admin/__tests__/user-levels-route.test.ts
git commit -m "feat(levels): level permission entity and admin level API"
```

---

### Task 10: Admin level control in the user detail modal

**Files:**
- Create: `src/data-hooks/use-user-levels.ts`
- Create: `src/components/admin/users/user-course-level-row.tsx`
- Modify: `src/components/admin/users/user-detail-modal.tsx` (Courses section)
- Modify: `src/db/users.ts` (`listUsers` — add levels)

**Interfaces:**
- Consumes: the API from Task 9, `LEVEL_LABELS` (Task 3). Levels for the list come from the `DISTINCT ON` query added to `listUsers` in Step 1 — there is deliberately no per-user helper, because the only consumer needs all users at once.
- Produces: `useUserLevelHistory(profileId, courseId)`, `useSetUserLevel(profileId)`, `<UserCourseLevelRow />`.

- [ ] **Step 1: Add levels to `listUsers`**

In `src/db/users.ts`, add a fourth query mirroring the existing three, and extend `AdminUser`:

```ts
export type AdminUser = {
  // …existing fields…
  /** Current level per course id. Absent for a course with no rows. */
  levels: Record<number, UserLevel>;
};
```

```ts
  const levelRows = await db.execute<{
    user_id: string;
    course_id: number;
    level: UserLevel;
  }>(sql`
    SELECT DISTINCT ON (user_id, course_id) user_id, course_id, level
    FROM user_levels
    ORDER BY user_id, course_id, created_at DESC, id DESC
  `);

  const levelsByUser = new Map<string, Record<number, UserLevel>>();
  for (const row of levelRows.rows) {
    const existing = levelsByUser.get(row.user_id) ?? {};
    existing[row.course_id] = row.level;
    levelsByUser.set(row.user_id, existing);
  }
```

and in the final map: `levels: levelsByUser.get(p.userId) ?? {}`.

Extend `adminUserSchema` in `src/lib/admin-schemas.ts` with `levels: z.record(z.coerce.number(), UserLevelSchema)`.

- [ ] **Step 2: Write the data hooks `src/data-hooks/use-user-levels.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from '#/data-hooks/keys';
import { useInvalidateUsers } from '#/data-hooks/use-admin-users';
import { LevelSourceSchema, UserLevelSchema } from '#/types';

const historyRowSchema = z.object({
  id: z.number(),
  level: UserLevelSchema,
  source: LevelSourceSchema,
  message: z.string().nullable(),
  note: z.string().nullable(),
  changedBy: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type LevelHistoryRow = z.infer<typeof historyRowSchema>;

export function useUserLevelHistory(profileId: number, courseId: number | null) {
  return useQuery({
    queryKey: dataKeys.userLevelHistory(profileId, courseId ?? 0),
    enabled: courseId !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<LevelHistoryRow[]> => {
      const res = await fetch(
        `/api/admin/users/${profileId}/levels?courseId=${courseId}`,
      );
      if (!res.ok) throw new Error('Could not load level history');
      const body = await res.json();
      return z.array(historyRowSchema).parse(body.history);
    },
  });
}

export function useSetUserLevel(profileId: number) {
  const queryClient = useQueryClient();
  const invalidateUsers = useInvalidateUsers();
  return useMutation({
    mutationFn: async (input: {
      courseId: number;
      level: string;
      message: string;
      note?: string;
    }) => {
      const res = await fetch(`/api/admin/users/${profileId}/levels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Couldn't set the level");
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.userLevelHistory(profileId, input.courseId),
      });
      invalidateUsers();
    },
  });
}
```

Add to `src/data-hooks/keys.ts`:

```ts
  userLevelHistory: (profileId: number, courseId: number) =>
    ['user-level-history', profileId, courseId] as const,
```

- [ ] **Step 3: Write the presentational row `src/components/admin/users/user-course-level-row.tsx`**

Pure — props in, JSX out, no hooks:

```tsx
import { Select } from '@base-ui/react/Select';
import { format } from 'date-fns';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';
import type { LevelHistoryRow } from '#/data-hooks/use-user-levels';

interface UserCourseLevelRowProps {
  courseName: string;
  level: UserLevel;
  history: readonly LevelHistoryRow[];
  historyOpen: boolean;
  inProgressCount: number;
  disabled: boolean;
  onToggleHistory: () => void;
  onLevelChange: (next: UserLevel) => void;
}

export const UserCourseLevelRow = ({
  courseName,
  level,
  history,
  historyOpen,
  inProgressCount,
  disabled,
  onToggleHistory,
  onLevelChange,
}: UserCourseLevelRowProps) => (
  <div className="border-s-2 border-gray-6 ps-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-12 text-sm">{courseName}</span>
      <Select.Root
        value={level}
        onValueChange={(next) => onLevelChange(next as UserLevel)}
        disabled={disabled}
      >
        <Select.Trigger
          className="rounded border border-gray-7 bg-gray-2 px-2 py-1 text-gray-12 text-sm disabled:opacity-60"
          aria-label={`Level in ${courseName}`}
        >
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} className="z-50">
            <Select.Popup className="rounded border border-gray-6 bg-gray-1 p-1 shadow-lg">
              {USER_LEVELS.map((value) => (
                <Select.Item
                  key={value}
                  value={value}
                  className="cursor-pointer rounded px-2 py-1 text-gray-12 text-sm data-[highlighted]:bg-gray-4"
                >
                  <Select.ItemText>{LEVEL_LABELS[value]}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>

    {inProgressCount > 0 && (
      <p className="mt-1 text-amber-11 text-xs">
        {inProgressCount} lesson{inProgressCount === 1 ? '' : 's'} in progress at
        this level will be hidden by a change.
      </p>
    )}

    <button
      type="button"
      onClick={onToggleHistory}
      className="mt-1 text-gray-11 text-xs underline"
      aria-expanded={historyOpen}
    >
      {historyOpen ? 'Hide history' : `History (${history.length})`}
    </button>

    {historyOpen && (
      <ul className="mt-2 space-y-2">
        {history.map((row) => (
          <li key={row.id} className="text-gray-11 text-xs">
            <span className="text-gray-12">{LEVEL_LABELS[row.level]}</span>
            {' · '}
            {format(row.createdAt, 'd MMM yyyy')}
            {' · '}
            {row.source}
            {row.message && <p className="text-gray-12">“{row.message}”</p>}
            {row.note && <p className="text-gray-11">Note: {row.note}</p>}
          </li>
        ))}
      </ul>
    )}
  </div>
);
```

- [ ] **Step 4: Wire it into `user-detail-modal.tsx`**

Inside the existing **Courses** section, render a `UserCourseLevelRow` beneath each *enrolled* course's checkbox. The container owns:
- `useUserLevelHistory(profileId, openCourseId)` for the disclosure,
- `useSetUserLevel(profileId)` for the write,
- a small dialog collecting `message` (required) and `note` (optional) before calling the mutation — use `react-hook-form` with a zod resolver over `setUserLevelInputSchema.omit({ courseId: true })`, matching the file's existing form usage.

Follow the section's existing convention: render the control only when the actor holds `level:update`, and omit it entirely otherwise rather than disabling it.

- [ ] **Step 5: Verify**

```bash
pnpm check && pnpm test
```

Then in the browser: open `/admin/users`, open a pilot with an enrolment, change their level with a message, reopen the history and confirm the row shows the message, the note, and the acting admin.

- [ ] **Step 6: Commit**

```bash
git add src/data-hooks/use-user-levels.ts src/data-hooks/keys.ts src/components/admin/users src/db/users.ts src/lib/admin-schemas.ts
git commit -m "feat(levels): per-course level control and history in the admin user modal"
```

---

### Task 11: `levels` control in the lesson editor

**Files:**
- Modify: `src/lib/admin-schemas.ts` (`updateLessonConfigInputSchema` ~line 161)
- Modify: `src/routes/api/admin/lessons.$lessonId.ts` (~line 91)
- Modify: `src/db/admin.ts` (`updateLessonConfig` ~line 788)
- Modify: `src/components/admin/lesson-config/config-section-container.tsx`

- [ ] **Step 1: Extend the PATCH schema**

`updateLessonConfigInputSchema` is `.strict()`, so an unknown `levels` key 400s until added:

```ts
export const updateLessonConfigInputSchema = z
  .object({
    isAvailable: z.boolean().optional(),
    hasDebrief: z.boolean().optional(),
    needsVideoWatch: z.boolean().optional(),
    requiredSubscriptions: SubscriptionsSchema.optional(),
    levels: UserLevelsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
```

- [ ] **Step 2: Accept it in the route**

`src/routes/api/admin/lessons.$lessonId.ts` — the existing `updateLessonConfigInputSchema` branch already forwards the whole parsed patch, so no change is needed beyond confirming `levels` flows through. Verify by reading the branch.

- [ ] **Step 3: Persist it**

`src/db/admin.ts`, `updateLessonConfig` — widen the patch type and the `returning`:

```ts
export async function updateLessonConfig(
  lessonId: number,
  patch: {
    isAvailable?: boolean;
    hasDebrief?: boolean;
    needsVideoWatch?: boolean;
    requiredSubscriptions?: SubscriptionType[];
    levels?: UserLevel[];
  },
): Promise<{ /* …existing… */ levels: UserLevel[] } | null> {
```

Add `levels: lessonsTable.levels` to `.returning({...})` and cast on the way out as the function already does for `requiredSubscriptions`. **The existing `invalidateCourseDetailsCache` call at the end is essential** — without it a level change sits behind the 6h Redis TTL.

- [ ] **Step 4: Add the control**

In `config-section-container.tsx`, add a fifth `ConfigSettingRow` with `layout="stacked"`, using the chip picker pattern from `src/components/admin/module-dependency-picker.tsx`:

```tsx
      <ConfigSettingRow
        layout="stacked"
        title="Levels"
        description="Which pilot levels see this lesson. Leave empty to show it to everyone."
      >
        <LevelPicker
          value={lesson.levels}
          onValueChange={(next) =>
            updateConfig.mutate({ lessonId: lesson.id, patch: { levels: next } })
          }
        />
      </ConfigSettingRow>
```

Write `LevelPicker` as a thin presentational wrapper over Base UI `Combobox` with `multiple`, values `USER_LEVELS`, labels from `LEVEL_LABELS`, placeholder `"All levels"` when empty. Copy the structure of `ModuleDependencyPicker` verbatim, dropping its `blockedReason` handling.

- [ ] **Step 5: Verify**

```bash
pnpm check && pnpm test
pnpm dev
```

Tag a lesson `Intermediate` in the editor, reload as a Basic pilot, confirm it disappears from the sidebar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-schemas.ts src/db/admin.ts src/components/admin/lesson-config
git commit -m "feat(levels): tag lessons with levels in the lesson editor"
```

---

### Task 12: Users-list level filter

**Files:**
- Modify: `src/components/admin/users/users-page-container.tsx` (nuqs search params)
- Modify: `src/components/admin/users/users-table.tsx` (filtering only — **no new column**)

- [ ] **Step 1: Add the search params**

Using `nuqs`, matching the existing `?tab=` / `?q=` usage in the container:

```ts
  const [levelFilter, setLevelFilter] = useQueryState('level');
  const [courseFilter, setCourseFilter] = useQueryState('course');
```

- [ ] **Step 2: Filter the rows**

```ts
  const filteredRows = useMemo(() => {
    if (!levelFilter || !courseFilter) return rows;
    const courseId = Number(courseFilter);
    return rows.filter((row) => (row.levels?.[courseId] ?? null) === levelFilter);
  }, [rows, levelFilter, courseFilter]);
```

Both filters are required together — "everyone at Basic" is meaningless without naming the course, since a pilot has one level per course. Render the level select disabled with the explanation *"Pick a course first"* until a course is chosen.

Do **not** add a level column to the table. With N enrolled courses there is no single value, and "highest across courses" would invent a number that means nothing.

- [ ] **Step 3: Verify and commit**

```bash
pnpm check && pnpm test
git add src/components/admin/users
git commit -m "feat(levels): filter the admin users list by level within a course"
```

---

# Phase 5 — Pilot experience

### Task 13: Promotion interstitial

**Files:**
- Create: `src/components/promotion-interstitial.tsx`
- Create: `src/atoms/promotion.ts`
- Modify: the lesson-page containers that call the progress mutations (`lesson-material-wrapper.tsx`, `lesson-quiz-container.tsx`, `debrief-quiz-container.tsx`, `use-milestone-reporter.ts`)

- [ ] **Step 1: Add the atom `src/atoms/promotion.ts`**

```ts
import { atom } from 'jotai';
import type { UserLevel } from '#/types';

/**
 * The promotion to show, set by whichever progress mutation's response carried
 * one. Null when there is nothing to announce.
 */
export const pendingPromotionAtom = atom<{
  from: UserLevel;
  to: UserLevel;
} | null>(null);
```

- [ ] **Step 2: Write the presentational interstitial**

```tsx
import { Dialog } from '@base-ui/react/Dialog';
import { LEVEL_LABELS } from '#/lib/level-labels';
import type { UserLevel } from '#/types';

interface PromotionInterstitialProps {
  promotion: { from: UserLevel; to: UserLevel } | null;
  newLessonCount: number;
  onDismiss: () => void;
}

export const PromotionInterstitial = ({
  promotion,
  newLessonCount,
  onDismiss,
}: PromotionInterstitialProps) => (
  <Dialog.Root open={promotion !== null} onOpenChange={(open) => !open && onDismiss()}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 bg-gray-a10" />
      <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed start-1/2 top-1/2 w-[min(28rem,90vw)] rounded-lg bg-gray-1 p-6 shadow-xl">
        {promotion && (
          <>
            <Dialog.Title className="font-semibold text-gray-12 text-xl">
              You're now {LEVEL_LABELS[promotion.to]}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-gray-11 text-sm">
              You've completed every {LEVEL_LABELS[promotion.from]} lesson in this
              course. {newLessonCount} new lesson
              {newLessonCount === 1 ? '' : 's'} {newLessonCount === 1 ? 'is' : 'are'}{' '}
              now available. Your completed work is still here, under Completed at
              earlier levels.
            </Dialog.Description>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-6 rounded bg-accent-9 px-4 py-2 text-accent-contrast"
            >
              See what's new
            </button>
          </>
        )}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
```

The "your completed work is still here" sentence is a promise the read-only view in Task 14 has to keep. Do not ship this copy before that task lands.

- [ ] **Step 3: Set the atom from each mutation's `onSuccess`**

In each progress mutation hook, parse `promotion` from the response and `set(pendingPromotionAtom, promotion)` when non-null. Mount `<PromotionInterstitial />` once in the course layout (`src/routes/_authed/course.$courseSlug.tsx`), reading the atom, invalidating `dataKeys.myLevel(courseSlug)` and the course-details query on dismiss so the new lesson set loads.

- [ ] **Step 4: Verify and commit**

```bash
pnpm check && pnpm test
git add src/components/promotion-interstitial.tsx src/atoms/promotion.ts src/data-hooks src/routes/_authed
git commit -m "feat(levels): announce a promotion in-flow"
```

---

### Task 14: Read-only mode and the level banner

**Files:**
- Modify: `src/components/lesson-main/lesson-main.tsx` (new `read-only` state)
- Modify: `src/components/lesson-main/compute-lesson-main-state.ts`
- Modify: `src/components/lesson-main/lesson-material-wrapper.tsx`, `lesson-player-container.tsx`, `parts/quiz/lesson-quiz-container.tsx`, `parts/debrief-quiz-container.tsx`
- Create: `src/components/course-level-banner.tsx`
- Modify: `src/routes/_authed.tsx` (`AlertBar` children)

- [ ] **Step 1: Add the read-only state**

`computeLessonMainState` gains a branch: when the material response carries `readOnly: true`, return `{ kind: 'read-only', … }`. `LessonMain` renders the same layout with a banner reading *"You completed this lesson at an earlier level. It's here for reference — nothing you do is recorded."*

- [ ] **Step 2: Make every write inert — not merely hidden**

Thread a `readOnly: boolean` prop down and pass it as `enabled: !readOnly` to:
- `useRecordLastViewedLesson({ lessonSlug, enabled })`
- `useSectionTapRecorder({ lessonSlug, enabled })`
- `useMilestoneReporter` — guard its reporting effect
- `lesson-quiz-container` — guard the auto-submit effect at `:171`, which fires on mount from local state and will otherwise write silently
- `debrief-quiz-container` — disable `generateTest` / `evaluateAnswer` / `saveResults`

The quiz auto-submit is the dangerous one: it is an effect, not a button, so hiding the UI would not stop it.

- [ ] **Step 3: Handle the 403 for never-completed out-of-tier lessons**

When `/api/lesson/material` returns `{ error: 'out-of-tier' }`, redirect to the course index and show a message naming the level: *"That lesson isn't part of your current level (Intermediate)."*

- [ ] **Step 4: Write the banner and mount it**

```tsx
interface CourseLevelBannerProps {
  level: string;
  message: string | null;
  onDismiss: () => void;
}

export const CourseLevelBanner = ({
  level,
  message,
  onDismiss,
}: CourseLevelBannerProps) => (
  <div className="flex items-center justify-between gap-3">
    <p className="text-sm">
      Your level in this course was changed to <strong>{level}</strong>.
      {message && <span> {message}</span>}
    </p>
    <button type="button" onClick={onDismiss} className="text-sm underline">
      Dismiss
    </button>
  </div>
);
```

`AlertBar` already renders `children` and is currently mounted with none — that is the intended seam. Feed it from `useMyLevel(courseSlug).data.pendingChange`, and call `useAcknowledgeLevelChange` on dismiss.

- [ ] **Step 5: Show the level on the course**

Add a small badge near the course title reading `LEVEL_LABELS[level]`, sourced from `useMyLevel`.

- [ ] **Step 6: Verify end to end**

```bash
pnpm check && pnpm test
pnpm dev
```

Walk the whole thing: complete a Basic tier → interstitial + promoted; open an old Basic lesson URL → read-only, no writes recorded (check `lesson_material_progress` does not gain a row); open a never-completed Basic lesson URL → redirected with an explanation; have an admin change the level → banner on next load carrying the message; dismiss → `acknowledged_at` stamped.

- [ ] **Step 7: Commit**

```bash
git add src/components src/routes/_authed.tsx
git commit -m "feat(levels): read-only archive view, level badge and change banner"
```

---

## Self-review notes

**Spec coverage.** §1 storage → Task 1–2. §2 promotion → Task 4, 8 (and the enrolment row in Task 2). §3 visibility → Task 3, 5, 6, 7, 14. §4 admin → Task 9, 10, 11, 12. §5 pilot experience → Task 13, 14. §6 tradeoffs are accepted, not implemented. §7 conventions → Global Constraints.

**Known gaps, deliberately left:**
- The spec's `requiredSubscriptions` clause in the promotion denominator is **not implemented**, because that filter does not exist in the app today. `isTierComplete` filters on `isAvailable` and `levels` only. This is recorded in the spec as a correction.
- `inProgressCount` in Task 10 needs a count of lessons at the pilot's current level with `0 < percent < 100`. Derive it from `getCourseProgress` in the modal's container; if that proves expensive across many courses, ship the row without the warning and add it separately rather than blocking the task.
- Task 8 adds a `getCourseProgress` call to every progress write. If the video-milestone path proves too hot in practice, the cheapest fix is to skip `maybePromote` there and rely on the section/quiz/debrief paths, at the cost of a promotion arriving one interaction late.

**Natural split point:** Tasks 1–8 are a complete, testable engine (levels stored, enforced, and earned). Tasks 9–14 are the surfaces. If you want two execution passes, stop after Task 8 — nothing in Phases 4–5 is a prerequisite for anything in Phases 1–3.
