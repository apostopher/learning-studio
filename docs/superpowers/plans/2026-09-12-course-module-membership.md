# Course Module Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move "which modules are in this course" from `modules.course_id` onto a `course_modules` placement table, so a module can later appear in more than one course — with zero user-visible change when this plan lands.

**Architecture:** `course_modules(course_id, module_id, rank)` becomes membership and order; `modules.course_id` is demoted to ownership (who may edit). Every existing module gets a backfill row, so every course renders identically. One shared helper defines membership, and all six read paths switch to it in three consecutive tasks. The pre-existing "infer a lesson's course with `.orderBy(courseId).limit(1)`" call sites are fixed here too, because they are the paths that break first once a module is in two courses.

**Tech Stack:** Drizzle ORM + PostgreSQL (Neon), TanStack Start/Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-course-remixing-design.md`

## Global Constraints

- **Never trust `schema.ts` about the live database.** Every schema step verifies against `information_schema`. On 2026-09-11 a `lessons.module_id` column that `schema.ts` had stopped declaring still carried `ON DELETE CASCADE` and destroyed 87 lessons.
- **Migrations are hand-written scripts** in `src/db/migrate-*.ts`, idempotent, following `src/db/migrate-material-links.ts`. Never `drizzle-kit push` — it wants to truncate `docs` (7,297 rows).
- `modules.rank` is **not** dropped until Task 7, after every read is off it. Until then it is the rollback.
- Vitest cannot resolve the `@/` alias — use `#/` in anything a test imports.
- Presentational components must stay hookless (react-compiler + Vitest nulls the dispatcher).
- Tests assert on **what the consumer received**, never that a value merely exists. Every test is seen red before its implementation.

---

### Task 1: `course_modules` table, schema and backfill

**Files:**
- Modify: `src/db/schema.ts` (add table after `modulesTable`, ~line 213)
- Create: `src/db/migrate-course-modules.ts`
- Modify: `package.json` (scripts)
- Test: `src/db/__tests__/migrate-course-modules.test.ts`

**Interfaces:**
- Produces: `courseModulesTable` with columns `id`, `courseId`, `moduleId`, `rank` (numeric string), `createdAt`; `planCourseModuleBackfill(modules): CourseModuleRow[]`.

- [ ] **Step 1: Write the failing test for the backfill planner**

```ts
// src/db/__tests__/migrate-course-modules.test.ts
import { describe, expect, it } from 'vitest';
import { planCourseModuleBackfill } from '../migrate-course-modules';

describe('planCourseModuleBackfill', () => {
  it('gives every module a row in its owning course, keeping its rank', () => {
    expect(
      planCourseModuleBackfill([
        { id: 10, courseId: 2, rank: '0.500000000000000' },
        { id: 19, courseId: 2, rank: '1.000000000000000' },
        { id: 12, courseId: 6, rank: '1.000000000000000' },
      ]),
    ).toEqual([
      { courseId: 2, moduleId: 10, rank: '0.500000000000000' },
      { courseId: 2, moduleId: 19, rank: '1.000000000000000' },
      { courseId: 6, moduleId: 12, rank: '1.000000000000000' },
    ]);
  });

  // The rank string is carried across verbatim, not parsed. `numeric(30,15)`
  // arrives from pg as a string, and Number() on it loses precision at the
  // 15th decimal — which is exactly where fractional ranks from repeated
  // drag-and-drop live.
  it('does not round-trip rank through a number', () => {
    const [row] = planCourseModuleBackfill([
      { id: 1, courseId: 1, rank: '1.333333333333333' },
    ]);
    expect(row.rank).toBe('1.333333333333333');
  });

  it('plans nothing for an empty database', () => {
    expect(planCourseModuleBackfill([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/migrate-course-modules.test.ts`
Expected: FAIL — `Failed to load url ../migrate-course-modules`.

- [ ] **Step 3: Add the table to `schema.ts`**

Insert directly after `modulesTable`'s `dbModuleSchema` block:

```ts
/**
 * Which modules a course shows, and in what order.
 *
 * Membership, not ownership. `modules.course_id` still says who OWNS a module
 * — who may rename or delete it — but this table says which rails it appears
 * in and where. A course's own modules get a row here too, so there is exactly
 * one answer to "what is in this course".
 *
 * The same shape `module_lessons` already gives lessons one level down: the
 * thing is owned in one place and placed in many, with the placement carrying
 * the per-course order.
 */
export const courseModulesTable = pgTable(
  'course_modules',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    moduleId: integer('module_id')
      .notNull()
      .references(() => modulesTable.id, { onDelete: 'cascade' }),
    /** Position in THIS course. Sibling courses order the same module freely. */
    rank: numeric('rank', { precision: 30, scale: 15 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('course_modules_course_module_idx').on(
      table.courseId,
      table.moduleId,
    ),
    index('course_modules_course_id_idx').on(table.courseId),
    index('course_modules_module_id_idx').on(table.moduleId),
  ],
);

export const courseModulesTableRelations = relations(
  courseModulesTable,
  ({ one }) => ({
    course: one(coursesTable, {
      fields: [courseModulesTable.courseId],
      references: [coursesTable.id],
    }),
    module: one(modulesTable, {
      fields: [courseModulesTable.moduleId],
      references: [modulesTable.id],
    }),
  }),
);
```

Add `courseModules: many(courseModulesTable)` to both `coursesTableRelations` and `modulesTableRelations`.

- [ ] **Step 4: Write the migration script**

```ts
// src/db/migrate-course-modules.ts
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export type ModuleRow = { id: number; courseId: number; rank: string };
export type CourseModuleRow = {
  courseId: number;
  moduleId: number;
  rank: string;
};

/**
 * One row per module, in the course that owns it, at the rank it already has.
 *
 * Pure so it can be tested without a database. `rank` stays a STRING the whole
 * way: `numeric(30,15)` arrives from pg as a string and parsing it loses the
 * low decimals that repeated drag-and-drop produces.
 */
export function planCourseModuleBackfill(
  modules: readonly ModuleRow[],
): CourseModuleRow[] {
  return modules.map((m) => ({
    courseId: m.courseId,
    moduleId: m.id,
    rank: m.rank,
  }));
}

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await db.execute<{ exists: boolean }>(
    sql`select to_regclass(${`public.${name}`}) is not null as exists`,
  );
  return rows[0]?.exists === true;
}

async function main() {
  if (await tableExists('course_modules')) {
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from course_modules`,
    );
    console.log(`course_modules already exists with ${rows[0]?.n} rows — nothing to do.`);
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      create table "course_modules" (
        "id" integer primary key generated always as identity,
        "course_id" integer not null references "courses"("id") on delete cascade,
        "module_id" integer not null references "modules"("id") on delete cascade,
        "rank" numeric(30,15) not null,
        "created_at" timestamp not null default now()
      )`);
    await tx.execute(sql`
      create unique index "course_modules_course_module_idx"
        on "course_modules" ("course_id", "module_id")`);
    await tx.execute(sql`
      create index "course_modules_course_id_idx" on "course_modules" ("course_id")`);
    await tx.execute(sql`
      create index "course_modules_module_id_idx" on "course_modules" ("module_id")`);

    // Backfill in SQL rather than round-tripping every row through node: the
    // planner above is the tested statement of intent, and this is the same
    // mapping expressed where the rows already are.
    await tx.execute(sql`
      insert into "course_modules" ("course_id", "module_id", "rank")
      select "course_id", "id", "rank" from "modules"`);
  });

  const { rows } = await db.execute<{ modules: number; placements: number }>(sql`
    select (select count(*) from modules)::int as modules,
           (select count(*) from course_modules)::int as placements`);
  const { modules, placements } = rows[0] ?? { modules: -1, placements: -2 };
  if (modules !== placements) {
    throw new Error(`backfill mismatch: ${modules} modules, ${placements} course_modules rows`);
  }
  console.log(`course_modules created; backfilled ${placements} rows.`);
  process.exit(0);
}

await main();
```

- [ ] **Step 5: Add the package script**

In `package.json` `scripts`, beside the other `db:migrate-*` entries:

```json
"db:migrate-course-modules": "dotenv -e .env.local -- tsx src/db/migrate-course-modules.ts",
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run src/db/__tests__/migrate-course-modules.test.ts && pnpm exec tsc --noEmit`
Expected: 3 passed, no type errors.

- [ ] **Step 7: Run the migration, then verify against the live schema**

```bash
pnpm db:migrate-course-modules
pnpm db:migrate-course-modules   # second run must say "already exists"
```

Then confirm in `information_schema` — not in `schema.ts`:

```bash
pnpm exec dotenv -e .env.local -- tsx -e "
import { sql } from 'drizzle-orm'; import { db } from './src/db';
const r = await db.execute(sql\`
  select (select count(*) from modules)::int m,
         (select count(*) from course_modules)::int cm,
         (select count(*) from course_modules cx join modules mx on mx.id=cx.module_id
           where mx.course_id <> cx.course_id)::int mismatched,
         (select count(*) from information_schema.columns
           where table_name='course_modules')::int cols\`);
console.log(JSON.stringify(r.rows[0])); process.exit(0)"
```

Expected: `m === cm`, `mismatched === 0`, `cols === 5`.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrate-course-modules.ts src/db/__tests__/migrate-course-modules.test.ts package.json
git commit -m "feat(db): add course_modules membership table and backfill"
```

---

### Task 2: The membership helper

**Files:**
- Create: `src/db/course-modules.ts`
- Test: `src/db/__tests__/course-modules.test.ts`

**Interfaces:**
- Consumes: `courseModulesTable` (Task 1).
- Produces: `courseModuleIds(courseId: number)` — a Drizzle subquery of module ids for use with `inArray`; `getCourseModuleIds(courseId: number): Promise<number[]>`.

Every read path in Tasks 3–5 goes through one of these two. That is the point: membership gets exactly one definition, so it cannot half-migrate.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/course-modules.test.ts
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ where: vi.fn(), from: vi.fn(), select: vi.fn() }));
vi.mock('#/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      m.select(...args);
      return { from: (t: unknown) => { m.from(t); return { where: (c: unknown) => { m.where(c); return ['SUBQUERY']; } }; } };
    },
  },
}));

const { courseModuleIds } = await import('../course-modules');
const { courseModulesTable } = await import('../schema');

describe('courseModuleIds', () => {
  /**
   * Mutant this catches: selecting `courseModulesTable.id` (the row's own key)
   * instead of `moduleId`. Both are integer columns on the same table, both
   * type-check, and the resulting `inArray` would filter modules by placement
   * id — quietly returning the wrong modules rather than none.
   */
  it('selects the MODULE id, from course_modules', () => {
    courseModuleIds(2);
    expect(m.select).toHaveBeenCalledWith({ id: courseModulesTable.moduleId });
    expect(m.from).toHaveBeenCalledWith(courseModulesTable);
    expect(m.where).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/course-modules.test.ts`
Expected: FAIL — cannot resolve `../course-modules`.

- [ ] **Step 3: Write the helper**

```ts
// src/db/course-modules.ts
import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { courseModulesTable } from '#/db/schema';

/**
 * The module ids a course shows, as a SUBQUERY.
 *
 * The single definition of membership. Every read that asks "which modules are
 * in this course" goes through this or `getCourseModuleIds` — two definitions
 * is how a rail comes to show a module that `lesson-access` says is not in the
 * course, which shows the learner a lesson and then refuses it on click.
 *
 * A subquery rather than an awaited array so callers keep one round trip.
 */
export function courseModuleIds(courseId: number) {
  return db
    .select({ id: courseModulesTable.moduleId })
    .from(courseModulesTable)
    .where(eq(courseModulesTable.courseId, courseId));
}

/** The same answer, resolved — for callers that need the ids in JS. */
export async function getCourseModuleIds(courseId: number): Promise<number[]> {
  const rows = await db
    .select({ id: courseModulesTable.moduleId })
    .from(courseModulesTable)
    .where(eq(courseModulesTable.courseId, courseId));
  return rows.map((r) => r.id);
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/db/__tests__/course-modules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/course-modules.ts src/db/__tests__/course-modules.test.ts
git commit -m "feat(db): add the single membership helper for course modules"
```

---

### Task 3: Admin board reads membership

**Files:**
- Modify: `src/db/admin.ts` (module query in `getCourseBoard`, ~line 486-501)
- Modify: `src/db/placements.ts:22-36` (`getPlacementsForCourse`)
- Test: `src/db/__tests__/course-board-membership.test.ts`

**Interfaces:**
- Consumes: `courseModuleIds` (Task 2).
- Produces: no signature changes — `getCourseBoard(courseId)` and `getPlacementsForCourse(courseId)` keep their shapes. `BoardModule.rank` now comes from `course_modules.rank`.

- [ ] **Step 1: Write the shared query-capture helper**

Tasks 3–6 all need to see what a query named. One definition, with real code:

```ts
// src/db/__tests__/support/capture-db.ts
/**
 * A Drizzle-shaped chain that records what it was given and resolves to [].
 *
 * Every builder method returns the same object, so `.select().from().where()`
 * chains without a database. `then` makes it awaitable, so a caller that does
 * `await db.select()...` gets an empty result rather than hanging.
 */
export type Captured = {
  select: unknown[];
  from: unknown[];
  joins: unknown[];
  where: unknown[];
  orderBy: unknown[];
};

const CHAIN_METHODS = [
  'select', 'selectDistinct', 'from', 'innerJoin', 'leftJoin', 'where',
  'orderBy', 'groupBy', 'having', 'limit', 'offset',
] as const;

export function captureDb() {
  const captured: Captured = { select: [], from: [], joins: [], where: [], orderBy: [] };
  // biome-ignore lint/suspicious/noExplicitAny: a stand-in for a builder whose real type is internal to Drizzle
  const chain: any = {};
  for (const name of CHAIN_METHODS) {
    chain[name] = (...args: unknown[]) => {
      if (name === 'select' || name === 'selectDistinct') captured.select.push(args[0]);
      if (name === 'from') captured.from.push(args[0]);
      if (name === 'innerJoin' || name === 'leftJoin') captured.joins.push(args[0]);
      if (name === 'where') captured.where.push(args[0]);
      if (name === 'orderBy') captured.orderBy.push(...args);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void) => resolve([]);
  return { db: chain, captured };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/db/__tests__/course-board-membership.test.ts
import { describe, expect, it, vi } from 'vitest';
import { captureDb } from './support/capture-db';

const cap = vi.hoisted(() => {
  // `captureDb` cannot be imported inside vi.hoisted, so build the chain here.
  const captured = { select: [] as unknown[], from: [] as unknown[], joins: [] as unknown[], where: [] as unknown[], orderBy: [] as unknown[] };
  return { captured };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured } = captureDb();
  Object.assign(cap.captured, captured);
  return { db };
});
const membership = vi.hoisted(() => ({ courseModuleIds: vi.fn(() => 'SUBQUERY') }));
vi.mock('#/db/course-modules', () => membership);

const { getPlacementsForCourse } = await import('../placements');
const { courseModulesTable } = await import('../schema');

describe('course board membership', () => {
  /**
   * The assertion is that this read path ASKS the membership helper — not that
   * some SQL string happens to contain a table name. One definition of
   * membership is the whole point; a path that hand-rolls the same join is the
   * mutant, and it passes any test that only checks the rendered SQL.
   */
  it('scopes placements through the membership helper', async () => {
    await getPlacementsForCourse(2);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(2);
  });
});
```

For `getCourseBoard`, whose module query must also *order* by the placement,
add to the same file:

```ts
  it('orders the board by the placement rank, not the module rank', async () => {
    const { getCourseBoard } = await import('../admin');
    await getCourseBoard(2);
    // Mutant: ordering by `modules.rank`. It compiles, and it looks right
    // until two courses order the same module differently.
    expect(cap.captured.orderBy.some((c) => String(c).includes('course_modules'))).toBe(true);
    expect(cap.captured.from).toContain(courseModulesTable);
  });
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/course-board-membership.test.ts`
Expected: FAIL — `courseModuleIds` was never called, and `from` names `modules`.

- [ ] **Step 4: Switch the board's module query**

In `src/db/admin.ts`, replace the module `select` inside `getCourseBoard`:

```ts
    db
      .select({
        id: modulesTable.id,
        name: modulesTable.name,
        slug: modulesTable.slug,
        imageUrlAvif: modulesTable.imageUrlAvif,
        imageUrlWebp: modulesTable.imageUrlWebp,
        // The placement's rank, not the module's: this course's order.
        rank: courseModulesTable.rank,
        requiredSubscriptions: modulesTable.requiredSubscriptions,
        sequentialLessons: modulesTable.sequentialLessons,
      })
      .from(courseModulesTable)
      .innerJoin(modulesTable, eq(modulesTable.id, courseModulesTable.moduleId))
      .where(eq(courseModulesTable.courseId, courseId))
      .orderBy(asc(courseModulesTable.rank), asc(modulesTable.id)),
```

Add `courseModulesTable` to the `#/db/schema` import.

- [ ] **Step 5: Switch `getPlacementsForCourse`**

In `src/db/placements.ts`, replace the join and filter:

```ts
    .from(moduleLessonsTable)
    .where(inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)))
    .orderBy(moduleLessonsTable.rank);
```

Drop the now-unused `innerJoin(modulesTable, …)`, import `inArray` from
`drizzle-orm` and `courseModuleIds` from `#/db/course-modules`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/db/__tests__/ src/components/admin/ && pnpm exec tsc --noEmit`
Expected: all pass. The editor renders identically — every module still has exactly one placement, in its owning course.

- [ ] **Step 7: Commit**

```bash
git add src/db/admin.ts src/db/placements.ts src/db/__tests__/support/capture-db.ts src/db/__tests__/course-board-membership.test.ts
git commit -m "refactor(db): read admin board membership from course_modules"
```

---

### Task 4: Learner payload reads membership

**Files:**
- Modify: `src/db/course.ts:73`, `:142`, `:295` and the payload cache version
- Modify: `src/db/course-content.ts:127`
- Test: `src/db/__tests__/course-payload-membership.test.ts`

**Interfaces:**
- Consumes: `courseModuleIds` (Task 2).
- Produces: no signature changes. The cached payload's version constant is bumped by one.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/course-payload-membership.test.ts
import { describe, expect, it, vi } from 'vitest';

const membership = vi.hoisted(() => ({
  courseModuleIds: vi.fn(() => 'SUBQUERY'),
  getCourseModuleIds: vi.fn(async () => []),
}));
vi.mock('#/db/course-modules', () => membership);
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  return { db: captureDb().db };
});

describe('learner payload membership', () => {
  it('builds the module list from the membership helper', async () => {
    const { getCourseDetails } = await import('../course');
    await getCourseDetails('itps-uas-remote');
    expect(membership.courseModuleIds).toHaveBeenCalled();
  });

  /**
   * The payload is cached under a versioned key. A reader holding a v4 entry
   * built from `modules.course_id` would keep being served it for the full 6h
   * TTL, so the key must move in the same commit as the query — exactly the
   * reasoning the v2→v3 and v3→v4 bumps already record.
   *
   * Mutant this catches: the query switched and the key left alone. Invisible
   * to every test that does not read the key, and it makes the rollout
   * silently partial for six hours.
   */
  it('bumps the cached payload key', async () => {
    const { COURSE_DETAILS_CACHE_KEY } = await import('../course');
    expect(COURSE_DETAILS_CACHE_KEY).toBe('course-details-v5');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/course-payload-membership.test.ts`
Expected: FAIL on both cases.

- [ ] **Step 3: Switch the three `course.ts` joins and `course-content.ts`**

Each currently reads `.leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))`. Replace with a join through the placement:

```ts
    .leftJoin(courseModulesTable, eq(courseModulesTable.courseId, coursesTable.id))
    .leftJoin(modulesTable, eq(modulesTable.id, courseModulesTable.moduleId))
```

and every `modulesTable.rank` used for ordering or output becomes
`courseModulesTable.rank`. The standalone `.where(eq(modulesTable.courseId, course.id))` at `course.ts:142` becomes:

```ts
      .where(inArray(modulesTable.id, courseModuleIds(course.id)))
```

- [ ] **Step 4: Bump the payload cache key**

The key is currently an inline string — `cacheWithRedis<…>('course-details-v4', getCourseDetails)` at `src/db/course.ts:253`. Extract and bump it so the version is assertable rather than buried in a call:

```ts
/**
 * The cached payload's version. Bumped whenever the payload's SHAPE or the
 * QUESTION it answers changes — see the v2→v3 and v3→v4 notes above.
 *
 * v4 -> v5: a course's modules now come from `course_modules` rather than
 * `modules.course_id`. A v4 entry answers a different question and must be
 * orphaned rather than served for the rest of its 6h TTL.
 */
export const COURSE_DETAILS_CACHE_KEY = 'course-details-v5';
```

and pass `COURSE_DETAILS_CACHE_KEY` where the literal was.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/db/ src/lib/ && pnpm exec tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/course.ts src/db/course-content.ts src/db/__tests__/course-payload-membership.test.ts
git commit -m "refactor(db): build the learner payload from course_modules"
```

---

### Task 5: Progress and library read membership

**Files:**
- Modify: `src/db/course-progress.ts:55`
- Modify: `src/db/library.ts:112`, `:172`
- Test: `src/db/__tests__/progress-library-membership.test.ts`

**Interfaces:**
- Consumes: `courseModuleIds` (Task 2). No signature changes.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/progress-library-membership.test.ts
import { describe, expect, it, vi } from 'vitest';

const membership = vi.hoisted(() => ({
  courseModuleIds: vi.fn(() => 'SUBQUERY'),
  getCourseModuleIds: vi.fn(async () => []),
}));
vi.mock('#/db/course-modules', () => membership);
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  return { db: captureDb().db };
});

describe('progress and library membership', () => {
  it('aggregates progress over the course’s placed modules', async () => {
    const { getCourseProgress } = await import('../course-progress');
    await getCourseProgress({ userId: 'u1', slug: 'itps-uas-remote' });
    expect(membership.courseModuleIds).toHaveBeenCalled();
  });

  /**
   * Library files resolve to a course two ways: through the lesson's placement,
   * and — for a file attached to a MODULE with no lesson — through the module.
   * The second is the one that reads `modules.course_id` today, and it is what
   * decides whether a borrowed module's files show up.
   */
  it('scopes module-level library files through the placement', async () => {
    const { getLibraryForCourse } = await import('../library');
    await getLibraryForCourse(2);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/progress-library-membership.test.ts`
Expected: FAIL on both.

- [ ] **Step 3: Switch `course-progress.ts`**

```ts
    .from(coursesTable)
    .innerJoin(courseModulesTable, eq(courseModulesTable.courseId, coursesTable.id))
    .innerJoin(modulesTable, eq(modulesTable.id, courseModulesTable.moduleId))
```

- [ ] **Step 4: Switch both `library.ts` sites**

At `:112`, the module-level branch becomes:

```ts
          and(
            sql`${lessonsTable.id} is null`,
            inArray(modulesTable.id, courseModuleIds(courseId)),
          ),
```

At `:172`, the `moduleCourse` alias join resolves a module's course for
display. Replace the join on `modulesTable.courseId` with one through
`courseModulesTable.courseId`, keeping the alias so the surrounding `or(...)`
is untouched.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/db/ && pnpm exec tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/course-progress.ts src/db/library.ts src/db/__tests__/progress-library-membership.test.ts
git commit -m "refactor(db): scope progress and library files by course_modules"
```

---

### Task 6: Stop inferring a lesson's course

**Files:**
- Modify: `src/db/lesson-access.ts` (delete `getCourseIdForLessonId`, ~line 136)
- Modify: `src/db/lesson-playback.ts:38-50`
- Modify: `src/db/course-last-viewed.ts:80-84`
- Modify: every caller the typechecker names
- Test: `src/db/__tests__/lesson-course-resolution.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getLessonPlaybackForCourse(lessonSlug: string, courseId: number)` replacing the inferring variant; `getCourseIdForLessonId` is **removed**.

This is the task the spec calls mandatory. `.orderBy(courseId).limit(1)` picks an arbitrary course among those teaching a lesson — deterministic, and wrong the moment a lesson is in two courses. A learner is always at `/course/$courseSlug/…`, so the course is known and must be passed in.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/db/__tests__/lesson-course-resolution.test.ts
//
// At the top of the file, alongside its existing mocks:
//   const membership = vi.hoisted(() => ({
//     courseModuleIds: vi.fn(() => 'SUBQUERY'),
//     getCourseModuleIds: vi.fn(async () => []),
//   }));
//   vi.mock('#/db/course-modules', () => membership);

describe('playback resolves against the course the learner is in', () => {
  /**
   * Mutant this catches — and it is what ships today: resolving the course
   * from the lesson with `.orderBy(courseId).limit(1)`. With a lesson taught
   * by courses 2 and 6, a learner in 6 is checked against 2's subscription
   * and 2's level.
   */
  it('filters on the course id it is given, not the lowest one', async () => {
    // Same mock pattern as Tasks 3-5: `vi.spyOn` cannot replace an ES module
    // export, so the module is mocked at the top of the file with
    // `vi.hoisted` and asserted here.
    const { getLessonPlaybackForCourse } = await import('../lesson-playback');
    await getLessonPlaybackForCourse('radio-failure', 6);
    expect(membership.courseModuleIds).toHaveBeenCalledWith(6);
  });

  it('no longer exports the inferring variant', async () => {
    const mod = await import('../lesson-access');
    expect('getCourseIdForLessonId' in mod).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/lesson-course-resolution.test.ts`
Expected: FAIL — `getLessonPlaybackForCourse` does not exist and the old export still does.

- [ ] **Step 3: Add the course-scoped playback lookup**

```ts
// src/db/lesson-playback.ts
/**
 * The playback row for a lesson AS TAUGHT BY one course.
 *
 * Takes the course explicitly. The previous version resolved it from the
 * lesson with `.orderBy(course_id).limit(1)` — an arbitrary pick among the
 * courses teaching it, which a learner in any other one silently got wrong.
 */
export async function getLessonPlaybackForCourse(
  lessonSlug: string,
  courseId: number,
) {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      courseId: sql<number>`${courseId}`,
    })
    .from(lessonsTable)
    .innerJoin(moduleLessonsTable, eq(moduleLessonsTable.lessonId, lessonsTable.id))
    .where(
      and(
        eq(lessonsTable.slug, lessonSlug),
        inArray(moduleLessonsTable.moduleId, courseModuleIds(courseId)),
      ),
    )
    .limit(1);
  if (!lesson?.videoProvider || !lesson.videoRef) return null;
  return lesson;
}
```

- [ ] **Step 4: Thread the course through the callers**

Run `pnpm exec tsc --noEmit` and fix each error it names. Every caller is a
route under `/course/$courseSlug/…` and already resolves the course — pass that
id rather than re-deriving it. Apply the same change to
`course-last-viewed.ts`, then delete `getCourseIdForLessonId` and its now-dead
test block.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm vitest run && pnpm exec tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/db src/routes src/lib
git commit -m "refactor(db): resolve a lesson's course from the route, not the lowest id"
```

---

### Task 7: Drop `modules.rank`

**Files:**
- Create: `src/db/migrate-drop-module-rank.ts`
- Modify: `src/db/schema.ts` (remove `rank` from `modulesTable`)
- Modify: `package.json`
- Test: `src/db/__tests__/migrate-drop-module-rank.test.ts`

Last on purpose: until here, `modules.rank` is the rollback.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/migrate-drop-module-rank.test.ts
import { describe, expect, it } from 'vitest';
import { modulesTable } from '../schema';

describe('modules.rank is gone', () => {
  /**
   * A superseded column left in a live database is what destroyed 87 lessons
   * on 2026-09-11 (`lessons.module_id`, still cascading long after `schema.ts`
   * stopped declaring it). This asserts the schema no longer offers it; the
   * migration's own verification asserts the database agrees.
   */
  it('is not declared on the table any more', () => {
    expect('rank' in modulesTable).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/migrate-drop-module-rank.test.ts`
Expected: FAIL — `rank` is still declared.

- [ ] **Step 3: Confirm nothing reads it**

```bash
grep -rn "modulesTable.rank\|modules\.rank\|\"rank\".*modules" src --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v course_modules
```

Expected: no hits outside `schema.ts`. Any hit is a read path Tasks 3–5 missed — fix it before continuing.

- [ ] **Step 4: Write the migration**

```ts
// src/db/migrate-drop-module-rank.ts
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main() {
  const { rows: cols } = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_name = 'modules' and column_name = 'rank'`);
  if (cols.length === 0) {
    console.log('modules.rank already dropped — nothing to do.');
    process.exit(0);
  }

  // Refuse while any module lacks a placement: dropping the column would
  // destroy the only record of that module's position.
  const { rows } = await db.execute<{ orphans: number }>(sql`
    select count(*)::int as orphans from modules m
    where not exists (select 1 from course_modules cm where cm.module_id = m.id)`);
  const orphans = rows[0]?.orphans ?? -1;
  if (orphans !== 0) {
    throw new Error(`${orphans} modules have no course_modules row — run db:migrate-course-modules first`);
  }

  await db.execute(sql`alter table "modules" drop column "rank"`);

  const { rows: after } = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_name='modules' and column_name='rank'`);
  if ((after[0]?.n ?? -1) !== 0) throw new Error('modules.rank still present after drop');
  console.log('modules.rank dropped.');
  process.exit(0);
}

await main();
```

- [ ] **Step 5: Remove `rank` from `modulesTable` and add the script**

Delete the `rank: numeric('rank', …)` line from `modulesTable` in `schema.ts`, and add:

```json
"db:migrate-drop-module-rank": "dotenv -e .env.local -- tsx src/db/migrate-drop-module-rank.ts",
```

- [ ] **Step 6: Run everything**

```bash
pnpm exec tsc --noEmit && pnpm vitest run
pnpm db:migrate-drop-module-rank
pnpm db:migrate-drop-module-rank   # must say "already dropped"
```

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/migrate-drop-module-rank.ts src/db/__tests__/migrate-drop-module-rank.test.ts package.json
git commit -m "refactor(db): drop the superseded modules.rank column"
```

---

## Done when

- `course_modules` holds exactly one row per module, and every read path names it.
- `grep -rn "modulesTable.courseId" src --include='*.ts'` returns only ownership uses: `getCourseIdForModuleId`, `createModule`, `deleteModule`, and the org resolution in `admin.ts`.
- `getCourseIdForLessonId` no longer exists.
- `modules.rank` is gone from both `schema.ts` and `information_schema`.
- The whole suite passes and the admin editor plus a learner course page render exactly as they did before this plan.

Plan 2 (`course_remixes`, sync rules, permissions, admin UI) builds on this and changes no read path.
