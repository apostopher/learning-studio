# Course Remixing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a course remix another — a live link that places every module the source owns onto the remixer's rail — behind one "Remix 3D Airmanship" button on the editor's course columns, with the borrowed modules editable only where they live and invisible as borrowed to learners.

**Architecture:** Plan 1 already made `course_modules` the single definition of membership, so no learner read path changes here. This plan adds the `course_remixes` link table and its sync rules (remix, un-remix, append-on-create, refuse-delete-while-remixed), points every module write at the right course (content → owner, position → viewing course), and teaches the editor that one module can now sit in two columns — which means course-qualified drag ids, provenance on borrowed cards, and refusals for edits that belong to the owner. The UI pins the remix source to a `FLAGSHIP_COURSE_SLUG` constant; every server function takes `(courseId, sourceCourseId)` and stays generic.

**Tech Stack:** Drizzle ORM + PostgreSQL (Neon), TanStack Start/Router, TanStack Query, Jotai, dnd-kit, Base UI, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-course-remixing-design.md` (Admin UI section amended 2026-09-14).

## Global Constraints

- **Never trust `schema.ts` about the live database.** Every schema step verifies against `information_schema`. Migrations are hand-written, idempotent scripts in `src/db/migrate-*.ts`, run with `pnpm db:<name>`. Never `drizzle-kit push` — it wants to truncate `docs` (7,297 rows).
- `course_remixes.source_course_id` is `on delete restrict`, never cascade: deleting a remixed source must fail rather than silently strip modules out of every remixer.
- Vitest cannot resolve the `@/` alias — use `#/` in anything a test imports.
- Presentational components are hookless (react-compiler + Vitest nulls the dispatcher). Router `Link`s reach them as slots built by the container.
- Every locked or withheld control states its reason and remedy in visible text AND in its accessible name.
- Tests assert on **what the consumer received** — the arguments a stub was called with, the rendered SQL a query built — never that a value merely exists. Every test is seen red before its implementation. Permission tests assert **which course id** the guard was handed, not merely that it threw.
- The learner payload carries no provenance key. `src/lib/course-details-shape.ts` is the one place that strips it.
- Only modules the source **owns** (`modules.course_id`) travel on a remix — never modules the source itself borrowed. This is what makes cycles harmless.
- Colours come from the semantic tokens already in use (`bg-apple-3`, `text-apple-text`, `bg-error-9 text-black`, …); no new hex values.

### On spec test group 1 (cross-path agreement)

Plan 1 routed every membership read — rail, learner payload, `lesson-access`, progress, library — through `courseModuleIds` / `getCourseModuleIds` (`src/db/course-modules.ts`) and pinned each with rendered SQL. Remixing writes rows to that same table and changes no read path, so "the rail shows M and access admits M's lesson" holds by construction. This plan therefore adds no database integration test for group 1; the remaining five groups are covered task by task below.

---

### Task 1: `course_remixes` table, schema and migration

**Files:**
- Modify: `src/db/schema.ts` (after `courseModulesTableRelations`, ~line 285)
- Create: `src/db/migrate-course-remixes.ts`
- Modify: `package.json` scripts (after `db:migrate-drop-module-rank`)
- Test: `src/db/__tests__/migrate-course-remixes.test.ts`

**Interfaces:**
- Produces: `courseRemixesTable` with columns `id`, `courseId`, `sourceCourseId`, `createdBy`, `createdAt`; `migrateCourseRemixes(): Promise<'created' | 'exists'>`.

- [ ] **Step 1: Write the failing migration test**

```ts
// src/db/__tests__/migrate-course-remixes.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateCourseRemixes } = await import('#/db/migrate-course-remixes');

type Query = { queryChunks?: Array<{ value?: unknown }> };

/** Same house pattern as migrate-drop-module-rank.test.ts. */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('migrateCourseRemixes', () => {
  it('no-ops when course_remixes already exists, without opening a transaction', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: true }] });
    const outcome = await migrateCourseRemixes();
    expect(outcome).toBe('exists');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('creates the table with RESTRICT on the source and CASCADE on the remixer, inside one transaction', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: false }] });
    const executed: string[] = [];
    db.transaction.mockImplementation(
      async (fn: (tx: { execute: (q: Query) => Promise<unknown> }) => Promise<void>) => {
        await fn({
          execute: async (q) => {
            executed.push(textOf(q));
            return { rows: [] };
          },
        });
      },
    );

    const outcome = await migrateCourseRemixes();

    expect(outcome).toBe('created');
    // Statement 0 is the table. Pinned as exact text: the two `on delete`
    // clauses are the whole reason this table is hand-written rather than
    // generated, and `restrict` vs `cascade` on the wrong column is the bug
    // the spec calls out (a deleted source silently emptying every remixer).
    expect(executed[0]).toBe(
      'create table "course_remixes" ( "id" integer primary key generated always as identity, "course_id" integer not null references "courses"("id") on delete cascade, "source_course_id" integer not null references "courses"("id") on delete restrict, "created_by" varchar(255), "created_at" timestamp not null default now() )',
    );
    expect(executed[1]).toBe(
      'create unique index "course_remixes_course_source_idx" on "course_remixes" ("course_id", "source_course_id")',
    );
    expect(executed[2]).toBe(
      'create index "course_remixes_source_course_id_idx" on "course_remixes" ("source_course_id")',
    );
    expect(executed).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/migrate-course-remixes.test.ts`
Expected: FAIL — cannot resolve `#/db/migrate-course-remixes`.

- [ ] **Step 3: Add the table to `schema.ts`**

Insert after `courseModulesTableRelations` (before `disciplinesTable`):

```ts
/**
 * `course_remixes` — which courses this one BORROWS FROM.
 *
 * A remix is a live link, not a copy: remixing A into B places every module A
 * OWNS (`modules.course_id = A`) onto B's rail as `course_modules` rows, and
 * keeps doing so — a module A creates later is appended to B by
 * `createModule`, one A deletes leaves B by cascade. Only owned modules
 * travel, never ones A itself borrowed, so A⇄B is two flat lists and nothing
 * recurses; the one rule is that a course may not remix itself.
 *
 * `source_course_id` is RESTRICT, not cascade: deleting a remixed source must
 * fail rather than silently strip modules out of every remixer. `deleteCourse`
 * refuses first with a friendly count; this constraint is the backstop for a
 * code path that forgets.
 */
export const courseRemixesTable = pgTable(
  'course_remixes',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** The remixer — the course whose rail gains the modules. */
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    /** The source — the course whose owned modules are borrowed. */
    sourceCourseId: integer('source_course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'restrict' }),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('course_remixes_course_source_idx').on(
      table.courseId,
      table.sourceCourseId,
    ),
    index('course_remixes_source_course_id_idx').on(table.sourceCourseId),
  ],
);

export const courseRemixesTableRelations = relations(
  courseRemixesTable,
  ({ one }) => ({
    course: one(coursesTable, {
      fields: [courseRemixesTable.courseId],
      references: [coursesTable.id],
      relationName: 'remixer',
    }),
    source: one(coursesTable, {
      fields: [courseRemixesTable.sourceCourseId],
      references: [coursesTable.id],
      relationName: 'remixSource',
    }),
  }),
);
```

Check `varchar` is already imported from `drizzle-orm/pg-core` at the top of `schema.ts` (it is used by other tables — `grep -n "varchar" src/db/schema.ts`); add it to the import if not. Add to `coursesTableRelations`:

```ts
  remixes: many(courseRemixesTable, { relationName: 'remixer' }),
  remixedBy: many(courseRemixesTable, { relationName: 'remixSource' }),
```

- [ ] **Step 4: Write the migration script**

```ts
// src/db/migrate-course-remixes.ts
import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Create `course_remixes` — the link table behind course remixing (spec:
 * docs/superpowers/specs/2026-09-12-course-remixing-design.md).
 *
 * Purely additive: no existing row changes and no read path consults the
 * table until a remix exists, so this can run any time before the Plan 2
 * code deploys and needs no relax/drop dance. Idempotent: probes
 * `information_schema`-equivalent `to_regclass` first and exits if the table
 * is already there, matching `migrate-course-modules.ts`.
 *
 * Both foreign keys are spelled out by hand because their `on delete`
 * clauses differ and that difference is the design: a remixer going away
 * takes its links with it (cascade); a SOURCE going away must be refused
 * (restrict) — see the table's comment in schema.ts.
 *
 * Run: pnpm db:migrate-course-remixes
 */
export async function migrateCourseRemixes(): Promise<'created' | 'exists'> {
  const { rows } = await db.execute<{ exists: boolean }>(
    sql`select to_regclass(${'public.course_remixes'}) is not null as exists`,
  );
  if (rows[0]?.exists === true) return 'exists';

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      create table "course_remixes" (
        "id" integer primary key generated always as identity,
        "course_id" integer not null references "courses"("id") on delete cascade,
        "source_course_id" integer not null references "courses"("id") on delete restrict,
        "created_by" varchar(255),
        "created_at" timestamp not null default now()
      )`);
    await tx.execute(sql`
      create unique index "course_remixes_course_source_idx"
        on "course_remixes" ("course_id", "source_course_id")`);
    await tx.execute(sql`
      create index "course_remixes_source_course_id_idx" on "course_remixes" ("source_course_id")`);
  });
  return 'created';
}

async function main() {
  const outcome = await migrateCourseRemixes();
  console.log(
    outcome === 'exists'
      ? 'course_remixes already exists — nothing to do.'
      : 'course_remixes created.',
  );
  process.exit(0);
}

// Guarded so the function can be imported by its unit test without the
// import itself running against the live database.
if (process.argv[1]?.endsWith('migrate-course-remixes.ts')) {
  await main();
}
```

- [ ] **Step 5: Add the package script**

In `package.json`, after `"db:migrate-drop-module-rank"`:

```json
    "db:migrate-course-remixes": "dotenv -e .env.local -- tsx src/db/migrate-course-remixes.ts",
```

- [ ] **Step 6: Run the test and typecheck**

Run: `pnpm vitest run src/db/__tests__/migrate-course-remixes.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS, tsc clean. If the exact-text assertion fails on whitespace, fix the SQL string in the script, not the test — the test is the spelled-out DDL.

- [ ] **Step 7: Run the migration and verify against the live schema**

Run: `pnpm db:migrate-course-remixes`
Expected: `course_remixes created.`

Then verify (write to `src/db/__check.tmp.mts`, run with `pnpm exec dotenv -e .env.local -- tsx src/db/__check.tmp.mts`, delete after):

```ts
import { sql } from 'drizzle-orm';
import { db } from './index';
console.log((await db.execute(sql`
  select tc.constraint_name, rc.delete_rule, kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
  where tc.table_name = 'course_remixes' and tc.constraint_type = 'FOREIGN KEY'`)).rows);
process.exit(0);
```

Expected: two rows — `course_id` → `CASCADE`, `source_course_id` → `RESTRICT`. Anything else: stop and fix before continuing.

Run it a second time: `pnpm db:migrate-course-remixes` → `course_remixes already exists — nothing to do.`

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrate-course-remixes.ts src/db/__tests__/migrate-course-remixes.test.ts package.json
git commit -m "feat(db): add the course_remixes link table"
```

---

### Task 2: The remix write helpers

**Files:**
- Create: `src/db/course-remixes.ts`
- Test: `src/db/__tests__/course-remixes.test.ts`

**Interfaces:**
- Consumes: `courseRemixesTable`, `courseModulesTable`, `modulesTable`, `courseOrgsTable`, `invalidateCourseDetailsCache` (`#/db/course-cache`), `getCourseSlugForCourseId` (`#/db/lesson-access`).
- Produces:
  - `remixCourse(input: { orgId: number; courseId: number; sourceCourseId: number; actorId: string | null }): Promise<RemixResult>` where `RemixResult = { ok: true; moduleCount: number } | { ok: false; reason: 'self' | 'not-found' | 'already-remixed' }`.
  - `unremixCourse(input: { orgId: number; courseId: number; sourceCourseId: number }): Promise<UnremixResult>` where `UnremixResult = { ok: true; moduleCount: number } | { ok: false; reason: 'not-found' }`.
  - `getRemixSourceIds(courseId: number): Promise<number[]>` — the courses this one borrows from.
  - `getRemixerCourseIds(sourceCourseId: number): Promise<number[]>` — the courses borrowing from this one.
  - `countRemixers(sourceCourseId: number): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/course-remixes.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * A minimal transaction double. Every builder method returns the same
 * object; `then` resolves the next queued result. `inserts` and `deletes`
 * record the table and values/where handed over, which is what these tests
 * assert on — the rows the placement table RECEIVED, not that a function
 * returned something.
 */
const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    inserts: [] as Array<{ table: unknown; values: unknown; onConflict: boolean }>,
    deletes: [] as Array<{ table: unknown; where: unknown }>,
    selects: [] as Array<{ from: unknown; where: unknown; joinOn: unknown[] }>,
  };
  function chain(kind?: 'insert' | 'delete', table?: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    let current: { from?: unknown; where?: unknown; joinOn: unknown[] } = { joinOn: [] };
    let insertRecord: { table: unknown; values: unknown; onConflict: boolean } | null =
      kind === 'insert' ? { table, values: undefined, onConflict: false } : null;
    for (const name of [
      'select', 'from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'values',
      'onConflictDoNothing', 'returning', 'limit',
    ]) {
      c[name] = (...args: unknown[]) => {
        if (name === 'from') current.from = args[0];
        if (name === 'innerJoin' || name === 'leftJoin') current.joinOn.push(args[1]);
        if (name === 'where') {
          current.where = args[0];
          if (kind === 'delete') state.deletes.push({ table, where: args[0] });
        }
        if (name === 'values' && insertRecord) insertRecord.values = args[0];
        if (name === 'onConflictDoNothing' && insertRecord) insertRecord.onConflict = true;
        return c;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (kind === undefined) state.selects.push({ ...current });
      if (insertRecord) state.inserts.push(insertRecord);
      current = { joinOn: [] };
      insertRecord = null;
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const tx = {
    select: () => chain(),
    insert: (table: unknown) => chain('insert', table),
    delete: (table: unknown) => chain('delete', table),
  };
  const db = {
    ...tx,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));
const cache = vi.hoisted(() => ({
  invalidateCourseDetailsCache: vi.fn(),
  getCourseSlugForCourseId: vi.fn(async (id: number) => `course-${id}`),
}));
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: cache.invalidateCourseDetailsCache,
}));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForCourseId: cache.getCourseSlugForCourseId,
}));

const { remixCourse, unremixCourse, countRemixers } = await import(
  '../course-remixes'
);
const { courseModulesTable, courseRemixesTable, modulesTable } = await import(
  '../schema'
);

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results.length = 0;
  fake.state.inserts.length = 0;
  fake.state.deletes.length = 0;
  fake.state.selects.length = 0;
});

const ORG = 1;

describe('remixCourse', () => {
  it('refuses a course remixing itself before touching the database', async () => {
    const result = await remixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 2, actorId: 'u1' });
    expect(result).toEqual({ ok: false, reason: 'self' });
    expect(fake.state.selects).toHaveLength(0);
    expect(fake.state.inserts).toHaveLength(0);
  });

  it('reads as not-found when either course is outside the org', async () => {
    fake.state.results.push([{ courseId: 2 }]); // only the remixer is in the org
    const result = await remixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6, actorId: 'u1' });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(fake.state.inserts).toHaveLength(0);
  });

  it('reports already-remixed when the link row already exists, placing nothing', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]); // org check
    fake.state.results.push([]); // insert … on conflict do nothing → no row
    const result = await remixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6, actorId: 'u1' });
    expect(result).toEqual({ ok: false, reason: 'already-remixed' });
    expect(fake.state.inserts).toHaveLength(1);
    expect(fake.state.inserts[0].table).toBe(courseRemixesTable);
  });

  /**
   * Mutant this catches: selecting the source's PLACEMENTS (`course_modules
   * where course_id = source`) instead of the modules it OWNS. Both return
   * the same rows until the source itself remixes something — then the
   * placement version carries borrowed modules across a second hop, which
   * the spec rules out (no transitivity; it is what keeps A⇄B finite).
   */
  it('places only the modules the source OWNS, in the source’s own order, appended after the remixer’s last rank', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]); // org check
    fake.state.results.push([{ id: 1 }]); // link row inserted
    fake.state.results.push([{ moduleId: 10, rank: '1' }, { moduleId: 11, rank: '2.5' }]); // owned modules
    fake.state.results.push([{ maxRank: '3' }]); // remixer's current max rank
    fake.state.results.push([]); // placement insert

    const result = await remixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6, actorId: 'u1' });

    expect(result).toEqual({ ok: true, moduleCount: 2 });
    // The owned-modules query: FROM modules, filtered on the OWNER column.
    const owned = fake.state.selects[1];
    expect(owned.from).toBe(modulesTable);
    expect(renderSql(owned.where as SQL)).toBe('"modules"."course_id" = $1');
    expect(renderSqlParams(owned.where as SQL)).toEqual([6]);
    // …joined to the source's placements for ORDER only.
    expect(renderSql(owned.joinOn[0] as SQL)).toBe(
      '("course_modules"."module_id" = "modules"."id" and "course_modules"."course_id" = $1)',
    );
    // The placement rows the remixer's rail received.
    const placement = fake.state.inserts[1];
    expect(placement.table).toBe(courseModulesTable);
    expect(placement.values).toEqual([
      { courseId: 2, moduleId: 10, rank: '4' },
      { courseId: 2, moduleId: 11, rank: '5' },
    ]);
    expect(placement.onConflict).toBe(true);
  });

  it('records who remixed, on the link row', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([{ id: 1 }]);
    fake.state.results.push([]); // no owned modules
    fake.state.results.push([{ maxRank: null }]);
    await remixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6, actorId: 'user_abc' });
    expect(fake.state.inserts[0].values).toEqual({
      courseId: 2,
      sourceCourseId: 6,
      createdBy: 'user_abc',
    });
  });

  it('invalidates the REMIXER’s learner payload, not the source’s', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([{ id: 1 }]);
    fake.state.results.push([]);
    fake.state.results.push([{ maxRank: null }]);
    await remixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6, actorId: null });
    expect(cache.invalidateCourseDetailsCache).toHaveBeenCalledWith('course-2');
    expect(cache.invalidateCourseDetailsCache).not.toHaveBeenCalledWith('course-6');
  });
});

describe('unremixCourse', () => {
  it('reads as not-found when no link exists, deleting no placements', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([]); // delete link → nothing
    const result = await unremixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6 });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(fake.state.deletes).toHaveLength(1);
    expect(fake.state.deletes[0].table).toBe(courseRemixesTable);
  });

  /**
   * Mutant this catches: deleting every placement in the remixer (dropping
   * the module-owner filter), or deleting the SOURCE's placements. The WHERE
   * pins both the remixer's course id and the owner subquery.
   */
  it('deletes exactly the remixer’s placements of modules the source owns', async () => {
    fake.state.results.push([{ courseId: 2 }, { courseId: 6 }]);
    fake.state.results.push([{ id: 1 }]); // link deleted
    fake.state.results.push([{ id: 7 }, { id: 8 }, { id: 9 }]); // placements deleted
    const result = await unremixCourse({ orgId: ORG, courseId: 2, sourceCourseId: 6 });
    expect(result).toEqual({ ok: true, moduleCount: 3 });
    const placements = fake.state.deletes[1];
    expect(placements.table).toBe(courseModulesTable);
    expect(renderSql(placements.where as SQL)).toBe(
      '("course_modules"."course_id" = $1 and "course_modules"."module_id" in (select "modules"."id" from "modules" where "modules"."course_id" = $2))',
    );
    expect(renderSqlParams(placements.where as SQL)).toEqual([2, 6]);
    expect(cache.invalidateCourseDetailsCache).toHaveBeenCalledWith('course-2');
  });
});

describe('countRemixers', () => {
  it('counts link rows whose SOURCE is the course', async () => {
    fake.state.results.push([{ n: 3 }]);
    expect(await countRemixers(6)).toBe(3);
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe(
      '"course_remixes"."source_course_id" = $1',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/course-remixes.test.ts`
Expected: FAIL — cannot resolve `../course-remixes`.

- [ ] **Step 3: Write the helpers**

```ts
// src/db/course-remixes.ts
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#/db';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { getCourseSlugForCourseId } from '#/db/lesson-access';
import {
  courseModulesTable,
  courseOrgsTable,
  courseRemixesTable,
  modulesTable,
} from '#/db/schema';

export type RemixResult =
  | { ok: true; moduleCount: number }
  | { ok: false; reason: 'self' | 'not-found' | 'already-remixed' };

export type UnremixResult =
  | { ok: true; moduleCount: number }
  | { ok: false; reason: 'not-found' };

/**
 * True when every id names a course in `orgId` — the editor's tenant boundary
 * (`getOrgEditorBoard` joins `course_orgs` for the same reason). Without
 * this, an admin (who bypasses `structure`) could remix a course from another
 * deployment's org into their own, or un-remix one out of it.
 */
async function coursesAreInOrg(orgId: number, ids: number[]): Promise<boolean> {
  const rows = await db
    .select({ courseId: courseOrgsTable.courseId })
    .from(courseOrgsTable)
    .where(
      and(eq(courseOrgsTable.orgId, orgId), inArray(courseOrgsTable.courseId, ids)),
    );
  const found = new Set(rows.map((r) => r.courseId));
  return ids.every((id) => found.has(id));
}

/**
 * Remix `sourceCourseId` into `courseId`: write the link row, then place every
 * module the source OWNS onto the remixer's rail, appended after its current
 * last module in the source's own order.
 *
 * OWNS — `modules.course_id` — not "is placed in the source": a source that
 * has itself remixed something does not pass those borrowed modules along.
 * One hop only (spec: no transitivity), which is also what makes A⇄B a pair
 * of flat lists rather than a recursion.
 *
 * Ordering joins the source's placements for rank only: an owned module with
 * no placement in its own course is not on the source's board either and is
 * left out here too. `onConflictDoNothing` on the placement insert is the
 * backstop for a module somehow already placed in the remixer — the unique
 * (course_id, module_id) index would otherwise fail the whole transaction.
 */
export async function remixCourse(input: {
  orgId: number;
  courseId: number;
  sourceCourseId: number;
  actorId: string | null;
}): Promise<RemixResult> {
  if (input.courseId === input.sourceCourseId) return { ok: false, reason: 'self' };
  if (!(await coursesAreInOrg(input.orgId, [input.courseId, input.sourceCourseId]))) {
    return { ok: false, reason: 'not-found' };
  }

  const result = await db.transaction(async (tx): Promise<RemixResult> => {
    const linked = await tx
      .insert(courseRemixesTable)
      .values({
        courseId: input.courseId,
        sourceCourseId: input.sourceCourseId,
        createdBy: input.actorId,
      })
      .onConflictDoNothing()
      .returning({ id: courseRemixesTable.id });
    if (linked.length === 0) return { ok: false, reason: 'already-remixed' };

    const owned = await tx
      .select({ moduleId: modulesTable.id, rank: courseModulesTable.rank })
      .from(modulesTable)
      .innerJoin(
        courseModulesTable,
        and(
          eq(courseModulesTable.moduleId, modulesTable.id),
          eq(courseModulesTable.courseId, input.sourceCourseId),
        ),
      )
      .where(eq(modulesTable.courseId, input.sourceCourseId))
      .orderBy(asc(courseModulesTable.rank), asc(modulesTable.id));

    const [{ maxRank }] = await tx
      .select({ maxRank: sql<string | null>`max(${courseModulesTable.rank})` })
      .from(courseModulesTable)
      .where(eq(courseModulesTable.courseId, input.courseId));
    const base = maxRank === null ? 0 : Number(maxRank);

    if (owned.length > 0) {
      await tx
        .insert(courseModulesTable)
        .values(
          owned.map((m, i) => ({
            courseId: input.courseId,
            moduleId: m.moduleId,
            rank: String(base + i + 1),
          })),
        )
        .onConflictDoNothing();
    }
    return { ok: true, moduleCount: owned.length };
  });

  if (result.ok) {
    // The remixer's learner payload just changed shape; the source's did not.
    await invalidateCourseDetailsCache(await getCourseSlugForCourseId(input.courseId));
  }
  return result;
}

/**
 * Undo a remix: drop the link, then every placement in the remixer of a
 * module the source OWNS. The remixer's own modules — and anything it
 * borrowed from a different source — are untouched, which the WHERE's owner
 * subquery guarantees.
 */
export async function unremixCourse(input: {
  orgId: number;
  courseId: number;
  sourceCourseId: number;
}): Promise<UnremixResult> {
  if (!(await coursesAreInOrg(input.orgId, [input.courseId, input.sourceCourseId]))) {
    return { ok: false, reason: 'not-found' };
  }

  const result = await db.transaction(async (tx): Promise<UnremixResult> => {
    const unlinked = await tx
      .delete(courseRemixesTable)
      .where(
        and(
          eq(courseRemixesTable.courseId, input.courseId),
          eq(courseRemixesTable.sourceCourseId, input.sourceCourseId),
        ),
      )
      .returning({ id: courseRemixesTable.id });
    if (unlinked.length === 0) return { ok: false, reason: 'not-found' };

    // The owner filter is a `sql` fragment rather than a builder subquery:
    // it is over the OWNER column, which has no membership-style helper
    // (`courseModuleIds` answers "placed in", the wrong question here), and a
    // fragment renders standalone so the WHERE can be pinned as text.
    const removed = await tx
      .delete(courseModulesTable)
      .where(
        and(
          eq(courseModulesTable.courseId, input.courseId),
          sql`${courseModulesTable.moduleId} in (select ${modulesTable.id} from ${modulesTable} where ${modulesTable.courseId} = ${input.sourceCourseId})`,
        ),
      )
      .returning({ id: courseModulesTable.id });
    return { ok: true, moduleCount: removed.length };
  });

  if (result.ok) {
    await invalidateCourseDetailsCache(await getCourseSlugForCourseId(input.courseId));
  }
  return result;
}

/** The courses `courseId` borrows from. */
export async function getRemixSourceIds(courseId: number): Promise<number[]> {
  const rows = await db
    .select({ sourceCourseId: courseRemixesTable.sourceCourseId })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.courseId, courseId));
  return rows.map((r) => r.sourceCourseId);
}

/** The courses borrowing from `sourceCourseId`. */
export async function getRemixerCourseIds(sourceCourseId: number): Promise<number[]> {
  const rows = await db
    .select({ courseId: courseRemixesTable.courseId })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.sourceCourseId, sourceCourseId));
  return rows.map((r) => r.courseId);
}

/** How many courses borrow from `sourceCourseId` — what `deleteCourse` refuses on. */
export async function countRemixers(sourceCourseId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseRemixesTable)
    .where(eq(courseRemixesTable.sourceCourseId, sourceCourseId));
  return Number(row?.n ?? 0);
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/db/__tests__/course-remixes.test.ts`
Expected: PASS. If the `inArray(…, subquery)` render differs in whitespace or parenthesisation from the string in the test, update the **test** string to the exact rendered text — the assertion's job is to pin the pairing (`course_id = remixer` AND `module_id in (owned by source)`), and the rendered shape is Drizzle's to choose.

- [ ] **Step 5: Commit**

```bash
git add src/db/course-remixes.ts src/db/__tests__/course-remixes.test.ts
git commit -m "feat(db): remix and un-remix a course through course_remixes"
```

---

### Task 3: Sync rules — append on create, refuse delete, count membership

**Files:**
- Modify: `src/db/admin.ts` — `createModule` (~267–343), `deleteCourse` (~1529–1560), `listAdminCourses` (~165–221)
- Modify: `src/routes/api/admin/courses.$courseId.ts` — `deleteCourseHandler`
- Modify: `src/data-hooks/use-delete-course.ts`
- Modify: `src/components/admin/delete-course-dialog-container.tsx`
- Modify: `src/routes/api/admin/__tests__/course-route.test.ts` — the delete cases
- Test: `src/db/__tests__/create-module-remix-sync.test.ts`, `src/db/__tests__/delete-course-remixed.test.ts`, `src/db/__tests__/admin-courses-membership-count.test.ts`

**Interfaces:**
- Consumes: `getRemixerCourseIds`, `countRemixers` (Task 2).
- Produces: `deleteCourse(courseId): Promise<DeleteCourseResult>` with `DeleteCourseResult = { ok: true } | { ok: false; reason: 'not-found' } | { ok: false; reason: 'remixed'; remixerCount: number }`; `CourseRequestError` (`status`, `remixerCount?`) thrown by `useDeleteCourse`.

- [ ] **Step 1: Write the failing test for append-on-create**

```ts
// src/db/__tests__/create-module-remix-sync.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
  };
  function chain(insertTable?: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    let values: unknown;
    for (const name of ['select', 'from', 'where', 'orderBy', 'values', 'returning', 'innerJoin', 'leftJoin', 'limit']) {
      c[name] = (...args: unknown[]) => {
        if (name === 'values') values = args[0];
        return c;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (insertTable !== undefined) state.inserts.push({ table: insertTable, values });
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const tx = { select: () => chain(), insert: (t: unknown) => chain(t) };
  const db = { ...tx, transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));
const remixes = vi.hoisted(() => ({ getRemixerCourseIds: vi.fn(async () => [] as number[]) }));
vi.mock('#/db/course-remixes', () => remixes);
const cache = vi.hoisted(() => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/course-cache', () => cache);
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(async (id: number) => `course-${id}`),
  getCourseSlugForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
}));
// admin.ts's server-only imports — same stub list as course-board-membership.test.ts.
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({ resolvePlayback: vi.fn(), validateCredentials: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));

const { createModule } = await import('../admin');
const { courseModulesTable } = await import('../schema');

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results.length = 0;
  fake.state.inserts.length = 0;
});

/** Queue the reads createModule performs before its inserts. */
function seed(opts: { remixers: number[] }) {
  remixes.getRemixerCourseIds.mockResolvedValue(opts.remixers);
  fake.state.results.push([{ id: 6, name: 'Source' }]); // owner course row (name for the payload)
  fake.state.results.push([]); // taken slugs
  fake.state.results.push([{ maxRank: '2' }]); // own max rank
  fake.state.results.push([{ id: 99, name: 'Weather', slug: 'weather', imageUrlAvif: null, imageUrlWebp: null, requiredSubscriptions: [], sequentialLessons: true }]); // module insert
  fake.state.results.push([]); // own placement insert
  fake.state.results.push([]); // remixer placements insert (if any)
}

describe('createModule → remixers', () => {
  it('appends one placement per remixer, ranked after that remixer’s own last module', async () => {
    seed({ remixers: [2, 5] });
    await createModule({ courseId: 6, name: 'Weather' });

    const remixerInsert = fake.state.inserts.find(
      (i) => i.table === courseModulesTable && Array.isArray(i.values),
    );
    expect(remixerInsert).toBeDefined();
    const rows = remixerInsert!.values as Array<{ courseId: number; moduleId: number; rank: SQL }>;
    expect(rows.map((r) => [r.courseId, r.moduleId])).toEqual([[2, 99], [5, 99]]);
    // Rank is computed IN the remixer, per row — not copied from the source.
    expect(renderSql(rows[0].rank)).toBe(
      'coalesce((select max("course_modules"."rank") from "course_modules" where "course_modules"."course_id" = $1), 0) + 1',
    );
    expect(renderSqlParams(rows[0].rank)).toEqual([2]);
    expect(renderSqlParams(rows[1].rank)).toEqual([5]);
  });

  it('writes no remixer rows when nothing remixes the owner', async () => {
    seed({ remixers: [] });
    await createModule({ courseId: 6, name: 'Weather' });
    const placementInserts = fake.state.inserts.filter((i) => i.table === courseModulesTable);
    expect(placementInserts).toHaveLength(1); // the owner's own placement only
  });

  it('invalidates every remixer’s learner payload as well as the owner’s', async () => {
    seed({ remixers: [2, 5] });
    await createModule({ courseId: 6, name: 'Weather' });
    const slugs = cache.invalidateCourseDetailsCache.mock.calls.map((c) => c[0]).sort();
    expect(slugs).toEqual(['course-2', 'course-5', 'course-6']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/create-module-remix-sync.test.ts`
Expected: FAIL — `remixerInsert` undefined; only two invalidations.

- [ ] **Step 3: Extend `createModule`**

In `src/db/admin.ts`, add the import `import { getRemixerCourseIds, countRemixers } from '#/db/course-remixes';` (alphabetically after `#/db/course-orgs`). At the top of `createModule`, before the slug loop, read the owner's name (Task 4 needs it in the returned `BoardModule`):

```ts
  const [owner] = await db
    .select({ id: coursesTable.id, name: coursesTable.name })
    .from(coursesTable)
    .where(eq(coursesTable.id, input.courseId));
  if (!owner) throw new Error(`createModule: no course ${input.courseId}`);
```

Then replace the transaction body so the remixer rows are written in the same transaction, after the owner's placement:

```ts
  // Every course that remixes THIS one gets the new module appended to its
  // rail, in the same transaction — this is what makes a remix "live". The
  // rank is computed per remixer, in SQL, against that remixer's own last
  // placement: a remixer's order is its own admin's, so the module lands at
  // the end where it is visible, not at the source's rank.
  const remixerIds = await getRemixerCourseIds(input.courseId);
  const created = await db.transaction(async (tx) => {
    const [module] = await tx
      .insert(modulesTable)
      .values({
        courseId: input.courseId,
        name: input.name,
        slug,
        imageUrlAvif: input.imageUrlAvif ?? null,
        imageUrlWebp: input.imageUrlWebp ?? null,
        requiredSubscriptions: [],
      })
      .returning();

    await tx.insert(courseModulesTable).values({
      courseId: input.courseId,
      moduleId: module.id,
      rank: String(rank),
    });

    if (remixerIds.length > 0) {
      await tx.insert(courseModulesTable).values(
        remixerIds.map((remixerId) => ({
          courseId: remixerId,
          moduleId: module.id,
          rank: sql`coalesce((select max(${courseModulesTable.rank}) from ${courseModulesTable} where ${courseModulesTable.courseId} = ${remixerId}), 0) + 1`,
        })),
      );
    }

    return module;
  });

  // The owner's payload and every remixer's just gained a module.
  await Promise.all(
    [input.courseId, ...remixerIds].map(async (id) =>
      invalidateCourseDetailsCache(await getCourseSlugForCourseId(id)),
    ),
  );
```

The returned `BoardModule` gains two fields now, so this task compiles on its own and Task 4 only has to add the read side:

```ts
    owner: { id: owner.id, name: owner.name },
    // Every remixer just received a placement of this module.
    otherCourseCount: remixerIds.length,
```

Declare them in `src/lib/admin-schemas.ts` in this task. Before `boardModuleSchema`:

```ts
/**
 * The course whose `modules.course_id` this is — who may rename, delete or
 * restructure the module. On a board it differs from the board's course
 * exactly when the module is BORROWED through a remix; the editor draws
 * provenance and withholds edit controls from that difference.
 */
export const boardModuleOwnerSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type BoardModuleOwner = z.infer<typeof boardModuleOwnerSchema>;
```

and inside `boardModuleSchema`, after `learnerCount`:

```ts
  owner: boardModuleOwnerSchema,
  /**
   * Placements of this module in courses OTHER than this board's. Said out
   * loud in the delete dialog: deleting a remixed source's module silently
   * reshapes every remixer, which is inherent to a live reference.
   */
  otherCourseCount: z.number(),
```

`tsc` will now flag every `BoardModule` / `EditorBoardModule` fixture and `getCourseBoard`'s mapping. Fixtures: add `owner: { id: <that fixture's course id>, name: '<that course's name>' }, otherCourseCount: 0`. `getCourseBoard`: add `owner: { id: courseId, name: course.name }, otherCourseCount: 0` as a **temporary** stand-in — Task 4 replaces it with the real join and count, and its test is what proves the stand-in gone.

- [ ] **Step 4: Run the sync test**

Run: `pnpm vitest run src/db/__tests__/create-module-remix-sync.test.ts`
Expected: PASS. If the queued `results` order in `seed` disagrees with the real query order (e.g. the owner-name select lands elsewhere), fix `seed`'s comments/order to match the implementation — the assertions are on the insert rows, not on the order of reads.

- [ ] **Step 5: Write the failing test for refuse-delete**

```ts
// src/db/__tests__/delete-course-remixed.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    deletes: 0,
    /** When set, the next DELETE rejects with this error instead of resolving. */
    failNextDelete: null as Error | null,
  };
  function chain(isDelete = false) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    for (const name of ['select', 'from', 'where', 'returning', 'leftJoin', 'innerJoin', 'limit']) {
      c[name] = () => c;
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (isDelete) {
        state.deletes += 1;
        if (state.failNextDelete) {
          const error = state.failNextDelete;
          state.failNextDelete = null;
          return Promise.reject(error).then(resolve, reject);
        }
      }
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  return { state, db: { select: () => chain(), delete: () => chain(true) } };
});
vi.mock('#/db', () => ({ db: fake.db }));
const remixes = vi.hoisted(() => ({
  getRemixerCourseIds: vi.fn(async () => [] as number[]),
  countRemixers: vi.fn(async () => 0),
}));
vi.mock('#/db/course-remixes', () => remixes);
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
  getCourseSlugForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
}));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({ resolvePlayback: vi.fn(), validateCredentials: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));

const { deleteCourse } = await import('../admin');

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results.length = 0;
  fake.state.deletes = 0;
  fake.state.failNextDelete = null;
});

describe('deleteCourse while remixed', () => {
  it('refuses with the remixer count and issues no DELETE', async () => {
    remixes.countRemixers.mockResolvedValue(2);
    fake.state.results.push([{ slug: 'src', imageUrlAvif: null, imageUrlWebp: null }]);
    const result = await deleteCourse(6);
    expect(result).toEqual({ ok: false, reason: 'remixed', remixerCount: 2 });
    expect(fake.state.deletes).toBe(0);
  });

  it('deletes when nothing remixes it', async () => {
    remixes.countRemixers.mockResolvedValue(0);
    fake.state.results.push([{ slug: 'src', imageUrlAvif: null, imageUrlWebp: null }]);
    fake.state.results.push([]); // module images
    fake.state.results.push([{ id: 6 }]); // delete returning
    const result = await deleteCourse(6);
    expect(result).toEqual({ ok: true });
    expect(fake.state.deletes).toBe(1);
  });

  it('reads as not-found when the delete matches nothing', async () => {
    remixes.countRemixers.mockResolvedValue(0);
    fake.state.results.push([]); // no course row
    fake.state.results.push([]); // module images
    fake.state.results.push([]); // delete returning nothing
    expect(await deleteCourse(404)).toEqual({ ok: false, reason: 'not-found' });
  });

  /**
   * The RESTRICT constraint is the backstop for a race: a remix written
   * between the count and the delete. Postgres raises 23503; the caller gets
   * the same friendly refusal, recounted.
   */
  it('turns a foreign-key violation on the delete into the same refusal', async () => {
    remixes.countRemixers.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    fake.state.results.push([{ slug: 'src', imageUrlAvif: null, imageUrlWebp: null }]);
    fake.state.results.push([]);
    fake.state.failNextDelete = Object.assign(new Error('fk'), { code: '23503' });
    const result = await deleteCourse(6);
    expect(result).toEqual({ ok: false, reason: 'remixed', remixerCount: 1 });
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/delete-course-remixed.test.ts`
Expected: FAIL — `deleteCourse` returns `true`/`false`, not a result object.

- [ ] **Step 7: Rewrite `deleteCourse`**

```ts
export type DeleteCourseResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'remixed'; remixerCount: number };

/** Postgres 23503, raised directly or wrapped by drizzle's DrizzleQueryError. */
function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { code?: unknown }).code === '23503') return true;
  const cause = (error as { cause?: unknown }).cause;
  return Boolean(
    cause && typeof cause === 'object' && (cause as { code?: unknown }).code === '23503',
  );
}

/**
 * Delete a course — refused, legibly, while another course still remixes it.
 *
 * `course_remixes.source_course_id` is `on delete restrict`, so the
 * alternative to this refusal is a foreign-key violation surfacing as a 500
 * that tells the admin nothing. The count is the instruction: it says how
 * many rails to un-remix from before this can go. Same shape as
 * `deleteDiscipline` refusing while it still holds lessons.
 */
export async function deleteCourse(courseId: number): Promise<DeleteCourseResult> {
  const remixerCount = await countRemixers(courseId);
  if (remixerCount > 0) return { ok: false, reason: 'remixed', remixerCount };

  // Collect the course cover and every cascade-deleted module cover so their
  // blobs can be removed after the row is gone. Also grab the slug here,
  // before the delete — once the row is gone there is nothing left to
  // resolve it from.
  const [course] = await db
    .select({
      slug: coursesTable.slug,
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
    })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  // OWNED modules (`modules.course_id`) — those are the rows the cascade
  // deletes and whose covers go with them. Borrowed placements just vanish.
  const moduleImages = await db
    .select({
      imageUrlAvif: modulesTable.imageUrlAvif,
      imageUrlWebp: modulesTable.imageUrlWebp,
    })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, courseId));

  let deleted: { id: number } | undefined;
  try {
    [deleted] = await db
      .delete(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .returning({ id: coursesTable.id });
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    // A remix landed between the count and the delete; RESTRICT held.
    return { ok: false, reason: 'remixed', remixerCount: await countRemixers(courseId) };
  }
  if (!deleted) return { ok: false, reason: 'not-found' };

  await invalidateCourseDetailsCache(course?.slug ?? null);
  await deleteBlobs([
    course?.imageUrlAvif,
    course?.imageUrlWebp,
    ...moduleImages.flatMap((m) => [m.imageUrlAvif, m.imageUrlWebp]),
  ]);
  return { ok: true };
}
```

Move the course-row select **before** the count if you prefer; the test seeds the course row first, then reads the count from the mock — adjust `seed` order in the test to match whichever you pick. The assertion that matters is `deletes === 0` on refusal.

- [ ] **Step 8: Route the refusal as a 409**

In `src/routes/api/admin/courses.$courseId.ts`, replace the tail of `deleteCourseHandler`:

```ts
  const result = await deleteCourse(courseId);
  if (result.ok) return new Response(null, { status: 204 });
  if (result.reason === 'remixed') {
    const noun = result.remixerCount === 1 ? 'course remixes' : 'courses remix';
    return Response.json(
      {
        error: `${result.remixerCount} other ${noun} this course. Un-remix it from each of them first, then delete it.`,
        remixerCount: result.remixerCount,
      },
      { status: 409 },
    );
  }
  return new Response('Not found', { status: 404 });
```

Update `src/routes/api/admin/__tests__/course-route.test.ts`: every `m.deleteCourse.mockResolvedValue(true)` becomes `{ ok: true }`, `false` becomes `{ ok: false, reason: 'not-found' }`, and add:

```ts
  it('409s with the remixer count while another course remixes it', async () => {
    m.deleteCourse.mockResolvedValue({ ok: false, reason: 'remixed', remixerCount: 2 });
    const res = await deleteCourseHandler(new Request('http://t/x', { method: 'DELETE' }), '6');
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: '2 other courses remix this course. Un-remix it from each of them first, then delete it.',
      remixerCount: 2,
    });
  });
```

- [ ] **Step 9: Surface the refusal in the dialog**

`src/data-hooks/use-delete-course.ts`:

```ts
/**
 * Error carrying the HTTP status and, for the one refusal with a number
 * attached, the remixer count — read off the JSON body, not parsed back out
 * of the sentence (see `DisciplineRequestError` for the reasoning).
 */
export class CourseRequestError extends Error {
  status: number;
  remixerCount?: number;
  constructor(message: string, status: number, remixerCount?: number) {
    super(message);
    this.name = 'CourseRequestError';
    this.status = status;
    this.remixerCount = remixerCount;
  }
}
```

and in `mutationFn`:

```ts
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; remixerCount?: number }
          | null;
        throw new CourseRequestError(
          body?.error ?? `Failed to delete course (${res.status})`,
          res.status,
          body?.remixerCount,
        );
      }
```

`delete-course-dialog-container.tsx`, `serverError`:

```tsx
              serverError={
                deleteCourse.error instanceof CourseRequestError &&
                deleteCourse.error.status === 409
                  ? deleteCourse.error.message
                  : deleteCourse.isError
                    ? 'Could not delete. Please try again.'
                    : undefined
              }
```

(import `CourseRequestError` from `@/data-hooks/use-delete-course`).

- [ ] **Step 10: Write the failing test for the courses-list count**

```ts
// src/db/__tests__/admin-courses-membership-count.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

const cap = vi.hoisted(() => {
  const captured = {
    select: [] as unknown[], from: [] as unknown[], joins: [] as unknown[], joinOn: [] as unknown[],
    where: [] as unknown[], orderBy: [] as unknown[], groupBy: [] as unknown[],
  } satisfies Captured;
  return { captured, results: [] as unknown[][] };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured, results } = captureDb();
  Object.assign(cap.captured, captured);
  cap.results = results;
  return { db };
});
vi.mock('#/db/course-remixes', () => ({ getRemixerCourseIds: vi.fn(), countRemixers: vi.fn() }));
vi.mock('#/db/course-modules', () => ({ courseModuleIds: vi.fn(() => 'SUBQUERY') }));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(), getCourseSlugForCourseId: vi.fn(), getCourseSlugForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(), lessonBelongsToCourseOrg: vi.fn(),
}));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({ resolvePlayback: vi.fn(), validateCredentials: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));

const { listAdminCourses } = await import('../admin');
const { courseModulesTable, modulesTable } = await import('../schema');

beforeEach(() => {
  for (const list of Object.values(cap.captured)) list.length = 0;
});

describe('listAdminCourses counts', () => {
  /**
   * Mutant this catches: counting OWNED modules (`modules.course_id`). A
   * remixer with three own modules and seven borrowed would show "3
   * modules" in the courses list and 10 on its rail.
   */
  it('joins modules through course_modules, so borrowed modules count', async () => {
    await listAdminCourses();
    expect(cap.captured.joins[0]).toBe(courseModulesTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"course_modules"."course_id" = "courses"."id"',
    );
    expect(cap.captured.joins[1]).toBe(modulesTable);
    expect(renderSql(cap.captured.joinOn[1] as SQL)).toBe(
      '"modules"."id" = "course_modules"."module_id"',
    );
  });
});
```

- [ ] **Step 11: Run it and watch it fail, then switch the join**

Run: `pnpm vitest run src/db/__tests__/admin-courses-membership-count.test.ts` → FAIL (`joins[0]` is `modulesTable`).

In `listAdminCourses`, replace `.leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))` with:

```ts
    // Membership, not ownership: a remixer's count includes the modules it
    // borrows, which is what its rail shows.
    .leftJoin(courseModulesTable, eq(courseModulesTable.courseId, coursesTable.id))
    .leftJoin(modulesTable, eq(modulesTable.id, courseModulesTable.moduleId))
```

- [ ] **Step 12: Run everything**

Run: `pnpm vitest run src/db src/routes/api/admin && pnpm exec tsc --noEmit -p .`
Expected: all PASS, tsc clean. `grep -rn "deleteCourse(" src --include='*.ts' --include='*.tsx'` must show only the route and tests consuming the new result shape.

- [ ] **Step 13: Commit**

```bash
git add src/db/admin.ts src/db/__tests__/create-module-remix-sync.test.ts src/db/__tests__/delete-course-remixed.test.ts src/db/__tests__/admin-courses-membership-count.test.ts 'src/routes/api/admin/courses.$courseId.ts' src/routes/api/admin/__tests__/course-route.test.ts src/data-hooks/use-delete-course.ts src/components/admin/delete-course-dialog-container.tsx src/lib/admin-schemas.ts
git commit -m "feat(db): keep remixers in sync — append on create, refuse delete while remixed"
```

---

### Task 4: Board payload carries owner and remix state; learner payload carries neither

**Files:**
- Modify: `src/lib/admin-schemas.ts` — `boardModuleSchema` (~147), `courseBoardSchema` (~189), `editorCourseBoardSchema` (~965)
- Modify: `src/db/admin.ts` — `getCourseBoard` (~487–644), `updateModuleDependencies` (~1363–1424)
- Modify: `src/lib/course-details-shape.ts`
- Test: `src/db/__tests__/course-board-provenance.test.ts`, `src/lib/__tests__/course-details-shape-provenance.test.ts`, extend `src/db/__tests__/course-board-membership.test.ts` fixtures if `tsc` flags them

**Interfaces:**
- Consumes: `getRemixSourceIds` (Task 2).
- Produces on every `BoardModule`: `owner: { id: number; name: string }` (the course whose `modules.course_id` this is) and `otherCourseCount: number` (placements of this module in courses other than the board's). On every `CourseBoard` / `EditorCourseBoard`: `remixes: Array<{ sourceCourseId: number }>`.

- [ ] **Step 1: Write the failing board test**

```ts
// src/db/__tests__/course-board-provenance.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

const cap = vi.hoisted(() => {
  const captured = {
    select: [] as unknown[], from: [] as unknown[], joins: [] as unknown[], joinOn: [] as unknown[],
    where: [] as unknown[], orderBy: [] as unknown[], groupBy: [] as unknown[],
  } satisfies Captured;
  return { captured, results: [] as unknown[][] };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured, results } = captureDb();
  Object.assign(cap.captured, captured);
  cap.results = results;
  return { db };
});
const remixes = vi.hoisted(() => ({
  getRemixSourceIds: vi.fn(async () => [] as number[]),
  getRemixerCourseIds: vi.fn(),
  countRemixers: vi.fn(),
}));
vi.mock('#/db/course-remixes', () => remixes);
vi.mock('#/db/course-modules', () => ({ courseModuleIds: vi.fn(() => 'SUBQUERY') }));
vi.mock('#/db/placements', () => ({
  getPlacementsForCourse: vi.fn(async () => []),
  movePlacement: vi.fn(),
}));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(), getCourseSlugForCourseId: vi.fn(), getCourseSlugForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(), lessonBelongsToCourseOrg: vi.fn(),
}));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({ resolvePlayback: vi.fn(), validateCredentials: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));

const { getCourseBoard } = await import('../admin');

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.results.length = 0;
});

const MODULE_ROW = {
  id: 10, name: 'Borrowed', slug: 'borrowed', imageUrlAvif: null, imageUrlWebp: null,
  rank: '4', requiredSubscriptions: [], sequentialLessons: true,
  ownerId: 6, ownerName: '3D Airmanship',
};

describe('getCourseBoard provenance', () => {
  it('names each module’s OWNER from modules.course_id, joined to courses', async () => {
    cap.results.push([{ id: 2, name: 'ITPS', slug: 'itps' }]);
    cap.results.push([MODULE_ROW]);
    cap.results.push([{ moduleId: 10, n: 2 }]); // placement counts
    remixes.getRemixSourceIds.mockResolvedValue([6]);

    const board = await getCourseBoard(2);

    expect(board?.modules[0].owner).toEqual({ id: 6, name: '3D Airmanship' });
    // The owner join pairs the aliased courses table with the OWNER column.
    const ownerJoin = cap.captured.joinOn.map((j) => renderSql(j as SQL));
    expect(ownerJoin).toContain('"owner_course"."id" = "modules"."course_id"');
  });

  it('reports how many OTHER courses show the module', async () => {
    cap.results.push([{ id: 2, name: 'ITPS', slug: 'itps' }]);
    cap.results.push([MODULE_ROW]);
    cap.results.push([{ moduleId: 10, n: 2 }]);
    const board = await getCourseBoard(2);
    expect(board?.modules[0].otherCourseCount).toBe(1);
  });

  it('carries the remix links so the editor knows what is already remixed', async () => {
    cap.results.push([{ id: 2, name: 'ITPS', slug: 'itps' }]);
    cap.results.push([]);
    remixes.getRemixSourceIds.mockResolvedValue([6]);
    const board = await getCourseBoard(2);
    expect(board?.remixes).toEqual([{ sourceCourseId: 6 }]);
    expect(remixes.getRemixSourceIds).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/course-board-provenance.test.ts`
Expected: FAIL — `owner` undefined.

- [ ] **Step 3: Extend the board schemas**

`owner` and `otherCourseCount` are already on `boardModuleSchema` (Task 3). Add to `courseBoardSchema` and `editorCourseBoardSchema`:

```ts
  /** The courses this one borrows from. Editor only — never in the learner payload. */
  remixes: z.array(z.object({ sourceCourseId: z.number() })),
```

- [ ] **Step 4: Extend `getCourseBoard`**

Imports: `import { alias } from 'drizzle-orm/pg-core';` and `getRemixSourceIds` from `#/db/course-remixes`.

Replace the modules query:

```ts
  const ownerCourse = alias(coursesTable, 'owner_course');
  const [modules, placements, remixSourceIds] = await Promise.all([
    db
      .select({
        id: modulesTable.id,
        name: modulesTable.name,
        slug: modulesTable.slug,
        imageUrlAvif: modulesTable.imageUrlAvif,
        imageUrlWebp: modulesTable.imageUrlWebp,
        rank: courseModulesTable.rank,
        requiredSubscriptions: modulesTable.requiredSubscriptions,
        sequentialLessons: modulesTable.sequentialLessons,
        // The OWNER — `modules.course_id` — which is a different course from
        // this board's exactly when the module is borrowed.
        ownerId: ownerCourse.id,
        ownerName: ownerCourse.name,
      })
      .from(courseModulesTable)
      .innerJoin(modulesTable, eq(modulesTable.id, courseModulesTable.moduleId))
      .innerJoin(ownerCourse, eq(ownerCourse.id, modulesTable.courseId))
      .where(eq(courseModulesTable.courseId, courseId))
      .orderBy(asc(courseModulesTable.rank), asc(modulesTable.id)),
    getPlacementsForCourse(courseId),
    getRemixSourceIds(courseId),
  ]);
```

After `moduleIds` is computed, add the placement-count query alongside `dependencies`/`learnerCounts` in the existing `Promise.all`:

```ts
        db
          .select({
            moduleId: courseModulesTable.moduleId,
            n: sql<number>`count(*)::int`,
          })
          .from(courseModulesTable)
          .where(inArray(courseModulesTable.moduleId, moduleIds))
          .groupBy(courseModulesTable.moduleId),
```

(destructure it as `placementCounts`; default `[]` in the empty branch), then `const placementCountByModule = new Map(placementCounts.map((r) => [r.moduleId, Number(r.n)]));`.

In the returned module mapping add:

```ts
      owner: { id: m.ownerId, name: m.ownerName },
      otherCourseCount: Math.max(0, (placementCountByModule.get(m.id) ?? 1) - 1),
```

and at the top level `remixes: remixSourceIds.map((sourceCourseId) => ({ sourceCourseId })),`.

Note the placement-count query is chain index 2 in the test's queue only if it is awaited before the dependency query; with `Promise.all` the order of `.then` calls is the order the builders are constructed. Put the count query **first** in that `Promise.all` array so the test's seeded result reaches it. If `board.modules[0].owner` passes but `otherCourseCount` reads 0, that ordering is why — reorder the array, not the test.

- [ ] **Step 5: Dependency siblings come from membership**

In `updateModuleDependencies`, replace the `siblings` query's `.where(eq(modulesTable.courseId, target.courseId))` with:

```ts
    // The modules on the OWNER's board — membership, not ownership: a
    // course's own module may depend on one it borrowed (the borrowed module
    // is present wherever this one is shown, since a remix takes the whole
    // source), and the picker offers exactly this list.
    .where(inArray(modulesTable.id, courseModuleIds(target.courseId)))
```

Add a case to `src/db/__tests__/course-board-membership.test.ts` (or a sibling file using the same harness) asserting `renderSql(where)` for that query is `"modules"."id" in SUBQUERY`-shaped — copy the pattern the file already uses for the board query.

- [ ] **Step 6: Write the failing learner-invisibility test**

```ts
// src/lib/__tests__/course-details-shape-provenance.test.ts
import { describe, expect, it } from 'vitest';
import { toLearnerCourseDetails } from '#/lib/course-details-shape';

/**
 * Spec test group 5. The mutant is someone adding `sourceCourseId` (or
 * leaving `courseId`, the OWNER column that `...module` spreads in from the
 * DB row) "just for debugging". A remixed course must serialise as one
 * cohesive course: no key on any module says where it came from.
 */
describe('toLearnerCourseDetails hides provenance', () => {
  it('strips the module’s owner id and any remix keys from every module', () => {
    const shaped = toLearnerCourseDetails(
      {
        id: 2,
        modules: [
          {
            id: 10,
            name: 'Borrowed',
            courseId: 6,
            lessons: [{ id: 1, videoProvider: 'mux', videoRef: 'x', otherVideoIds: [] }],
          },
        ],
      },
      false,
    );
    const mod = shaped.modules[0] as Record<string, unknown>;
    expect(Object.keys(mod)).not.toContain('courseId');
    expect(Object.keys(mod).filter((k) => /owner|source|remix/i.test(k))).toEqual([]);
    expect(mod.name).toBe('Borrowed');
  });
});
```

- [ ] **Step 7: Run it and watch it fail, then strip the owner**

Run: `pnpm vitest run src/lib/__tests__/course-details-shape-provenance.test.ts` → FAIL (`courseId` present).

In `src/lib/course-details-shape.ts`, extend `CourseShape` and the mapping:

```ts
type ModuleWithOwner = {
  courseId?: unknown;
  lessons: readonly LessonWithSecrets[];
};
type CourseShape = { modules: readonly ModuleWithOwner[] };

/**
 * `courseId` on a module is its OWNER (`modules.course_id`), which differs
 * from the course being viewed exactly when the module is borrowed through a
 * remix. A learner must never learn that — the course they bought is one
 * cohesive course — so the key is dropped here, the one place that shapes
 * the payload. Nothing in the learner UI reads it (grep `module.courseId`
 * under src/components, src/hooks, src/routes/course before widening this).
 */
function omitModuleOwner<T extends { courseId?: unknown }>(
  mod: T,
): Omit<T, 'courseId'> {
  const { courseId: _owner, ...rest } = mod;
  return rest;
}
```

and in `toLearnerCourseDetails`: `modules: course.modules.map((mod) => ({ ...omitModuleOwner(mod), lessons: mod.lessons.map(omitLessonSecrets) }))`. Check the declared learner `CourseDetailsShape` type further down the file does not list `courseId` on modules; if it does, remove it there too and fix any compile error that reveals a reader.

- [ ] **Step 8: Run everything and fix fixtures**

Run: `pnpm exec tsc --noEmit -p .`
Every fixture typed `CourseBoard` / `EditorCourseBoard` now fails: add `remixes: []` to each. Remove the temporary `owner`/`otherCourseCount` stand-in Task 3 left in `getCourseBoard` — the real values come from the join and the count query above. Then:

Run: `pnpm vitest run && pnpm exec tsc --noEmit -p .`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin-schemas.ts src/db/admin.ts src/lib/course-details-shape.ts src/db/__tests__ src/lib/__tests__ src/components src/routes
git commit -m "feat(admin): board modules name their owner; learner payload never does"
```

---

### Task 5: Remix and un-remix routes

**Files:**
- Modify: `src/lib/admin-schemas.ts` — add `remixCourseInputSchema`
- Create: `src/routes/api/admin/courses.$courseId.remixes.ts`
- Create: `src/routes/api/admin/courses.$courseId.remixes.$sourceCourseId.ts`
- Test: `src/routes/api/admin/__tests__/course-remixes-route.test.ts`

**Interfaces:**
- Consumes: `remixCourse`, `unremixCourse` (Task 2); `requireCoursePermission`, `getActiveOrgId`.
- Produces: `POST /api/admin/courses/:courseId/remixes` body `{ sourceCourseId }` → 201 `{ moduleCount }` | 400 self/invalid | 403 | 404 | 409 already-remixed. `DELETE /api/admin/courses/:courseId/remixes/:sourceCourseId` → 200 `{ moduleCount }` | 403 | 404.

- [ ] **Step 1: Write the failing route test**

```ts
// src/routes/api/admin/__tests__/course-remixes-route.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() { super('Forbidden'); this.name = 'ForbiddenError'; }
  }
  return {
    ForbiddenError,
    requireCoursePermission: vi.fn(),
    remixCourse: vi.fn(),
    unremixCourse: vi.fn(),
    getActiveOrgId: vi.fn(() => 1),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError: m.ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({ requireCoursePermission: m.requireCoursePermission }));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: m.getActiveOrgId }));
vi.mock('#/db/course-remixes', () => ({ remixCourse: m.remixCourse, unremixCourse: m.unremixCourse }));

import { postRemixHandler } from '../courses.$courseId.remixes';
import { deleteRemixHandler } from '../courses.$courseId.remixes.$sourceCourseId';

function post(body: unknown): Request {
  return new Request('http://t/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.remixCourse.mockResolvedValue({ ok: true, moduleCount: 7 });
  m.unremixCourse.mockResolvedValue({ ok: true, moduleCount: 7 });
});

describe('POST /api/admin/courses/:courseId/remixes', () => {
  /**
   * Spec test group 2. The bug shape is `requireCoursePermission(B)` where
   * it should be `(A)` — or only one of the two — so the assertion is on the
   * exact (courseId, entity, action) pairs, in order, not on a throw.
   */
  it('asks for structure:update on the REMIXER and structure:read on the SOURCE', async () => {
    await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(m.requireCoursePermission.mock.calls.map((c) => c.slice(1))).toEqual([
      [2, 'structure', 'update'],
      [6, 'structure', 'read'],
    ]);
  });

  it('403s when the remixer guard refuses, without checking the source or writing', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(res.status).toBe(403);
    expect(m.requireCoursePermission).toHaveBeenCalledTimes(1);
    expect(m.remixCourse).not.toHaveBeenCalled();
  });

  it('403s when the source guard refuses, without writing', async () => {
    m.requireCoursePermission
      .mockResolvedValueOnce({ userId: 'u1' })
      .mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(res.status).toBe(403);
    expect(m.remixCourse).not.toHaveBeenCalled();
  });

  it('400s a course remixing itself before guarding', async () => {
    const res = await postRemixHandler(post({ sourceCourseId: 2 }), '2');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('hands the writer the org, both ids and the actor', async () => {
    await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(m.remixCourse).toHaveBeenCalledWith({
      orgId: 1, courseId: 2, sourceCourseId: 6, actorId: 'u1',
    });
  });

  it('201s with the module count', async () => {
    const res = await postRemixHandler(post({ sourceCourseId: 6 }), '2');
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ moduleCount: 7 });
  });

  it('409s an already-remixed pair and 404s an unknown course', async () => {
    m.remixCourse.mockResolvedValueOnce({ ok: false, reason: 'already-remixed' });
    expect((await postRemixHandler(post({ sourceCourseId: 6 }), '2')).status).toBe(409);
    m.remixCourse.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    expect((await postRemixHandler(post({ sourceCourseId: 6 }), '2')).status).toBe(404);
  });
});

describe('DELETE /api/admin/courses/:courseId/remixes/:sourceCourseId', () => {
  it('asks for structure:update on the REMIXER only — removing a borrowed rail needs no rights on the source', async () => {
    await deleteRemixHandler(new Request('http://t/x', { method: 'DELETE' }), '2', '6');
    expect(m.requireCoursePermission.mock.calls.map((c) => c.slice(1))).toEqual([
      [2, 'structure', 'update'],
    ]);
  });

  it('hands the writer the org and both ids, and 200s with the count', async () => {
    const res = await deleteRemixHandler(new Request('http://t/x', { method: 'DELETE' }), '2', '6');
    expect(m.unremixCourse).toHaveBeenCalledWith({ orgId: 1, courseId: 2, sourceCourseId: 6 });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ moduleCount: 7 });
  });

  it('404s when no such remix exists', async () => {
    m.unremixCourse.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    const res = await deleteRemixHandler(new Request('http://t/x', { method: 'DELETE' }), '2', '6');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/routes/api/admin/__tests__/course-remixes-route.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Add the input schema**

In `src/lib/admin-schemas.ts` near `createModuleInputSchema`:

```ts
export const remixCourseInputSchema = z.object({
  sourceCourseId: z.number().int().positive(),
});
export type RemixCourseInput = z.infer<typeof remixCourseInputSchema>;
```

- [ ] **Step 4: Write the routes**

```ts
// src/routes/api/admin/courses.$courseId.remixes.ts
import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { remixCourse } from '#/db/course-remixes';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { remixCourseInputSchema } from '#/lib/admin-schemas';
import {
  type CourseActor,
  requireCoursePermission,
} from '#/lib/permissions.server';

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Remix `sourceCourseId` into `courseId`.
 *
 * Two guards, both required (spec, Permissions row 4): `structure:update` on
 * the REMIXER — it is that rail being reshaped — and `structure:read` on the
 * SOURCE, because placing someone's modules on your syllabus needs at least
 * the standing to see them. The same rule the knowledge library applies to
 * placing another discipline's lesson. Remixer first, so a caller with no
 * rights on their own course learns nothing about the source's existence.
 *
 * A course remixing itself is a 400 on the body's shape, answered before
 * either guard: both ids are the caller's own, so nothing is disclosed.
 */
export async function postRemixHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = remixCourseInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sourceCourseId } = parsed.data;
  if (sourceCourseId === courseId) {
    return Response.json({ error: 'A course cannot remix itself' }, { status: 400 });
  }

  let actor: CourseActor;
  try {
    actor = await requireCoursePermission(request.headers, courseId, 'structure', 'update');
    await requireCoursePermission(request.headers, sourceCourseId, 'structure', 'read');
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw error;
  }

  const result = await remixCourse({
    orgId: getActiveOrgId(),
    courseId,
    sourceCourseId,
    actorId: actor.userId,
  });
  if (result.ok) {
    return Response.json({ moduleCount: result.moduleCount }, { status: 201 });
  }
  if (result.reason === 'already-remixed') {
    return Response.json({ error: 'This course already remixes that one' }, { status: 409 });
  }
  if (result.reason === 'self') {
    return Response.json({ error: 'A course cannot remix itself' }, { status: 400 });
  }
  return Response.json({ error: 'Course not found' }, { status: 404 });
}

export const Route = createFileRoute('/api/admin/courses/$courseId/remixes')({
  server: {
    handlers: {
      POST: ({ request, params }) => postRemixHandler(request, params.courseId),
    },
  },
});
```

`CourseActor` is exported from `#/lib/permissions.server` (line ~82).

```ts
// src/routes/api/admin/courses.$courseId.remixes.$sourceCourseId.ts
import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { unremixCourse } from '#/db/course-remixes';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { requireCoursePermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Un-remix: drop the link and every borrowed placement. Guarded on the
 * REMIXER only (spec, Permissions row 1 — "remove from B's rail" is B's
 * authority); no rights on the source are needed to stop borrowing from it.
 */
export async function deleteRemixHandler(
  request: Request,
  courseIdRaw: string,
  sourceCourseIdRaw: string,
): Promise<Response> {
  const courseId = parseId(courseIdRaw);
  const sourceCourseId = parseId(sourceCourseIdRaw);
  if (courseId === null || sourceCourseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  try {
    await requireCoursePermission(request.headers, courseId, 'structure', 'update');
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw error;
  }

  const result = await unremixCourse({ orgId: getActiveOrgId(), courseId, sourceCourseId });
  if (result.ok) return Response.json({ moduleCount: result.moduleCount });
  return Response.json({ error: 'Remix not found' }, { status: 404 });
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/remixes/$sourceCourseId',
)({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        deleteRemixHandler(request, params.courseId, params.sourceCourseId),
    },
  },
});
```

- [ ] **Step 5: Run the test, regenerate the route tree, typecheck**

Run: `pnpm vitest run src/routes/api/admin/__tests__/course-remixes-route.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean. If `routeTree.gen.ts` is committed in this repo and tsc complains about the new routes, start `pnpm dev` briefly (it regenerates the tree) or run the router generator, then re-run tsc. Commit the regenerated `routeTree.gen.ts` **only** if it is tracked (`git ls-files src/routeTree.gen.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-schemas.ts 'src/routes/api/admin/courses.$courseId.remixes.ts' 'src/routes/api/admin/courses.$courseId.remixes.$sourceCourseId.ts' src/routes/api/admin/__tests__/course-remixes-route.test.ts
git commit -m "feat(api): remix and un-remix routes, guarded on remixer and source"
```

---

### Task 6: Reorder is guarded and written on the VIEWING course

**Files:**
- Modify: `src/lib/admin-schemas.ts` — `reorderModuleInputSchema` (~195)
- Modify: `src/routes/api/admin/modules.$moduleId.ts` — `patchModuleHandler`
- Modify: `src/data-hooks/use-reorder-editor-module.ts`, `src/data-hooks/use-reorder-module.ts`
- Modify: `src/components/admin/resolve-drop.ts` — `reorder-module` resolution gains `courseId`
- Modify: `src/components/admin/editor-container.tsx` (~507–530), `src/components/admin/module-board-container.tsx` (the reorder `mutate` call)
- Test: `src/routes/api/admin/__tests__/module-dependencies-route.test.ts` (the reorder cases), `src/data-hooks/__tests__/use-reorder-editor-module.test.tsx`, `src/components/admin/__tests__/resolve-drop.test.ts`

**Interfaces:**
- Produces: reorder body `{ courseId, prevModuleId, nextModuleId }`; `DropResolution` `reorder-module` variant `{ kind: 'reorder-module'; courseId: number; moduleId: number; overModuleId: number }`; both reorder hooks' vars gain `courseId: number`.

Why: today the PATCH route resolves the module's OWNER and guards there. Reordering a borrowed module on B's rail must be guarded on **B** and must move B's placement — the owner has nothing to do with it (spec, Permissions row 1; "A reorders its own rail → B is unaffected").

- [ ] **Step 1: Write the failing route test**

Add to `describe('patchModuleHandler')` in `module-dependencies-route.test.ts`:

```ts
  /**
   * Spec test group 2 / row 1. A reorder moves the placement in the course
   * whose rail was dragged — which, for a borrowed module, is NOT its owner.
   * The mutant is the old code: resolve the owner (42) and guard/write there,
   * which would let B's admin reorder A's rail and refuse them their own.
   */
  it('guards a reorder on the course in the BODY, not the module’s owner, and writes there', async () => {
    m.reorderModule.mockResolvedValue({ id: 7, rank: 2 });
    await patchModuleHandler(
      patch({ courseId: 2, prevModuleId: 1, nextModuleId: null }),
      '7',
    );
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(), 2, 'structure', 'update',
    );
    expect(m.getCourseIdForModuleId).not.toHaveBeenCalled();
    expect(m.reorderModule).toHaveBeenCalledWith({
      courseId: 2, moduleId: 7, prevModuleId: 1, nextModuleId: null,
    });
  });

  it('404s a reorder of a module not placed in that course', async () => {
    m.reorderModule.mockResolvedValue(null);
    const res = await patchModuleHandler(
      patch({ courseId: 2, prevModuleId: 1, nextModuleId: null }),
      '7',
    );
    expect(res.status).toBe(404);
  });
```

Update the existing case `'hands the reorder writer the course resolved for the guard, alongside the neighbours'` to send `courseId: 42` in the body and expect the guard on 42 (its title becomes `'hands the reorder writer the course from the body, alongside the neighbours'`). Any existing reorder case sending a body without `courseId` must now expect a 400 — that body no longer parses as a reorder and falls through to `Invalid body`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/routes/api/admin/__tests__/module-dependencies-route.test.ts`
Expected: FAIL — guard called with 42, `getCourseIdForModuleId` called.

- [ ] **Step 3: Schema and route**

`reorderModuleInputSchema`:

```ts
export const reorderModuleInputSchema = z
  .object({
    /**
     * The course whose rail was dragged. Position belongs to the VIEWING
     * course — a borrowed module sits at one rank in its owner and another
     * here — so the guard and the write both use this, never the owner.
     */
    courseId: z.number().int().positive(),
    prevModuleId: z.number().int().positive().nullable(),
    nextModuleId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.prevModuleId !== null || v.nextModuleId !== null, {
    message: 'At least one neighbor is required',
  });
```

In `patchModuleHandler`, move the JSON parse to directly after `parseModuleId`, and handle the reorder shape **before** resolving the owner:

```ts
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // A reorder is the one module write that belongs to the VIEWING course,
  // not the owner: it moves this module's placement in `body.courseId`'s
  // rail. Guarded there, written there, and the owner is never resolved —
  // resolving it would misreport a stale board's reorder of a since-deleted
  // module as "forbidden" instead of "not found".
  const reorder = reorderModuleInputSchema.safeParse(body);
  if (reorder.success) {
    const denied = await guard(request, reorder.data.courseId, 'update');
    if (denied) return denied;
    const updated = await reorderModule({
      courseId: reorder.data.courseId,
      moduleId,
      prevModuleId: reorder.data.prevModuleId,
      nextModuleId: reorder.data.nextModuleId,
    });
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  // Everything else edits the module ITSELF — rename, image, tier,
  // sequencing, prerequisites — and follows the owner.
  const courseId = await getCourseIdForModuleId(moduleId);
  ...
```

Delete the old reorder branch at the bottom.

- [ ] **Step 4: Hooks and callers**

`use-reorder-editor-module.ts`: `ReorderVars` gains `courseId: number`; the body becomes `{ courseId: vars.courseId, prevModuleId, nextModuleId }`. Its test (`use-reorder-editor-module.test.tsx`) asserts the fetch body — add `courseId` to the expected body and to the vars it mutates with.

`use-reorder-module.ts`: it already takes `courseId`; send it in the body: `body: JSON.stringify({ courseId, prevModuleId: vars.prevModuleId, nextModuleId: vars.nextModuleId })`.

`resolve-drop.ts`: the `reorder-module` variant gains `courseId: number`, returned as `courseId: from.courseBoard.course.id`. Update `resolve-drop.test.ts`'s reorder expectations to include `courseId`.

`editor-container.tsx` reorder `mutate`: add `courseId: resolution.courseId`. `module-board-container.tsx`: nothing to add — `useReorderModule(courseId)` supplies it.

- [ ] **Step 5: Run everything**

Run: `pnpm vitest run src/routes/api/admin src/data-hooks src/components/admin && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-schemas.ts 'src/routes/api/admin/modules.$moduleId.ts' src/routes/api/admin/__tests__/module-dependencies-route.test.ts src/data-hooks src/components/admin
git commit -m "fix(api): guard and write module reorders on the viewing course, not the owner"
```

---

### Task 7: Course-qualified drag ids on the rail

**Files:**
- Modify: `src/lib/dnd-ids.ts`
- Modify: `src/components/admin/resolve-drop.ts` (`findModule`, `findPlacedLesson`, `resolveOverModule`, `resolveDrop`)
- Modify: `src/components/admin/editor-board-updates.ts` (every helper that takes a bare module/lesson id — `reorderModulesOnBoard`, `moduleNeighbours`, and the one at ~line 34 that parses an id)
- Modify: `src/components/admin/editor-container.tsx` (~293, ~384, ~465, ~927), `editor-course-column-container.tsx` (~114), `editor-module-container.tsx`, `editor-lesson-card-container.tsx`, `module-board-container.tsx` (~62, ~90, ~150, ~180–221), `sortable-module-column.tsx`, `sortable-lesson-card.tsx`, `lesson-board-container.tsx`
- Test: `src/components/admin/__tests__/dnd-targets.test.ts`, `resolve-drop.test.ts`, `editor-board-updates.test.ts`, plus new cases below

**Interfaces:**
- Produces:
  ```ts
  export const moduleDndId = (courseId: number, moduleId: number) => `module-${courseId}-${moduleId}`;
  export const lessonDndId = (courseId: number, lessonId: number) => `lesson-${courseId}-${lessonId}`;
  export const containerDndId = (courseId: number, moduleId: number) => `container-${courseId}-${moduleId}`;
  export type ParsedDndId =
    | { type: 'module' | 'lesson' | 'container'; courseId: number; id: number }
    | { type: 'library-lesson' | 'discipline' | 'course'; id: number; courseId?: undefined };
  export function parseDndId(id: string | number): ParsedDndId | null;
  ```
  `findModule(board, courseId, moduleId)`, `findPlacedLesson(board, courseId, lessonId)`, `reorderModulesOnBoard(board, courseId, moduleId, overModuleId)`, `moduleNeighbours(board, courseId, moduleId)`.

Why: the org editor is one `DndContext`, and dnd-kit ids must be unique inside it. Once 3D Airmanship's module 10 is also on ITPS's rail, `module-10` (and `lesson-<id>` for each of its lessons, and `container-10`) is registered twice, and `findModule` returns whichever column comes first on the board — a drag started on ITPS's rail would resolve against 3D Airmanship's. Qualifying the three rail kinds by course id makes every registration unique and every lookup column-scoped. Library, discipline and course ids are already unique and stay as they are.

- [ ] **Step 1: Write the failing tests**

Add to `dnd-targets.test.ts` (or a new `dnd-ids.test.ts` if that file tests something else):

```ts
import { containerDndId, lessonDndId, moduleDndId, parseDndId } from '#/lib/dnd-ids';

describe('course-qualified rail ids', () => {
  it('round-trips module, lesson and container ids with their course', () => {
    expect(parseDndId(moduleDndId(2, 10))).toEqual({ type: 'module', courseId: 2, id: 10 });
    expect(parseDndId(lessonDndId(2, 55))).toEqual({ type: 'lesson', courseId: 2, id: 55 });
    expect(parseDndId(containerDndId(6, 10))).toEqual({ type: 'container', courseId: 6, id: 10 });
  });

  it('gives the same module a different id in each course it is shown in', () => {
    expect(moduleDndId(2, 10)).not.toBe(moduleDndId(6, 10));
  });

  it('leaves library, discipline and course ids unqualified', () => {
    expect(parseDndId('library-lesson-5')).toEqual({ type: 'library-lesson', id: 5 });
    expect(parseDndId('discipline-5')).toEqual({ type: 'discipline', id: 5 });
    expect(parseDndId('course-5')).toEqual({ type: 'course', id: 5 });
  });

  it('rejects a rail id missing its course', () => {
    expect(parseDndId('module-10')).toBeNull();
  });
});
```

Add to `resolve-drop.test.ts`, using the file's existing board fixture builders (module fixtures need `owner`/`otherCourseCount`, boards need `remixes: []` from Task 4):

```ts
  /**
   * The same module on two rails. A drag that starts on course 2's copy and
   * lands on course 2's other module is a reorder IN COURSE 2 — the mutant
   * is `findModule` returning the first column that holds module 10 (course
   * 6, the owner), which then refuses the drop as cross-course.
   */
  it('resolves a reorder within the column the drag started in, even when the module is also on another rail', () => {
    const shared = module({ id: 10, name: 'Shared', owner: { id: 6, name: 'Source' } });
    const board = [
      courseBoard({ id: 6, name: 'Source' }, [shared]),
      courseBoard({ id: 2, name: 'Remixer' }, [module({ id: 20, name: 'Own' }), shared]),
    ];
    expect(resolveDrop(board, moduleDndId(2, 10), moduleDndId(2, 20))).toEqual({
      kind: 'reorder-module', courseId: 2, moduleId: 10, overModuleId: 20,
    });
  });
```

Add to `editor-board-updates.test.ts`:

```ts
  it('reorders only the named course’s copy of a module shown on two rails', () => {
    const shared = module({ id: 10, owner: { id: 6, name: 'Source' } });
    const board = [
      courseBoard({ id: 6 }, [shared, module({ id: 11 })]),
      courseBoard({ id: 2 }, [module({ id: 20 }), shared]),
    ];
    const next = reorderModulesOnBoard(board, 2, 10, 20);
    expect(next[1].modules.map((m) => m.id)).toEqual([10, 20]);
    expect(next[0].modules.map((m) => m.id)).toEqual([10, 11]); // untouched
    expect(moduleNeighbours(next, 2, 10)).toEqual({ prevModuleId: null, nextModuleId: 20 });
    expect(moduleNeighbours(next, 6, 10)).toEqual({ prevModuleId: null, nextModuleId: 11 });
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/components/admin/__tests__/dnd-targets.test.ts src/components/admin/__tests__/resolve-drop.test.ts src/components/admin/__tests__/editor-board-updates.test.ts`
Expected: FAIL — signature mismatches / wrong column.

- [ ] **Step 3: Rewrite `dnd-ids.ts`**

```ts
export type DndType =
  | 'module'
  | 'lesson'
  | 'container'
  | 'library-lesson'
  | 'discipline'
  | 'course';

/**
 * Rail kinds are qualified by COURSE. A module — and every lesson placed in
 * it — can sit on two rails at once through a remix, and dnd-kit ids must be
 * unique inside the one `DndContext` both panes share; `module-10` twice is
 * two sortables fighting over one id, and a lookup by module id alone lands
 * on whichever column comes first. The course id makes each registration
 * unique and every lookup column-scoped.
 */
export const moduleDndId = (courseId: number, moduleId: number) =>
  `module-${courseId}-${moduleId}`;
export const lessonDndId = (courseId: number, lessonId: number) =>
  `lesson-${courseId}-${lessonId}`;
/** Droppable wrapping a module's lesson area (so empty modules accept drops). */
export const containerDndId = (courseId: number, moduleId: number) =>
  `container-${courseId}-${moduleId}`;
/** A lesson card in the library pane, distinct from a placed `lesson`. */
export const libraryLessonDndId = (id: number) => `library-lesson-${id}`;
export const disciplineDndId = (id: number) => `discipline-${id}`;
export const courseDndId = (id: number) => `course-${id}`;

export type ParsedDndId =
  | { type: 'module' | 'lesson' | 'container'; courseId: number; id: number }
  | { type: 'library-lesson' | 'discipline' | 'course'; id: number; courseId?: undefined };

const RAIL_TYPES = new Set(['module', 'lesson', 'container']);
const FLAT_TYPES = new Set(['library-lesson', 'discipline', 'course']);

export function parseDndId(id: string | number): ParsedDndId | null {
  const raw = String(id);
  // Rail ids end in TWO numbers; flat ids in one. Match from the end so a
  // type name containing a hyphen (`library-lesson`) cannot be split apart.
  const rail = /^(.+)-(\d+)-(\d+)$/.exec(raw);
  if (rail && RAIL_TYPES.has(rail[1])) {
    return {
      type: rail[1] as 'module' | 'lesson' | 'container',
      courseId: Number(rail[2]),
      id: Number(rail[3]),
    };
  }
  const flat = /^(.+)-(\d+)$/.exec(raw);
  if (flat && FLAT_TYPES.has(flat[1])) {
    return { type: flat[1] as 'library-lesson' | 'discipline' | 'course', id: Number(flat[2]) };
  }
  return null;
}
```

- [ ] **Step 4: Thread `courseId` through every producer and consumer**

Producers (`useSortable`/`useDroppable`/`SortableContext items`): `editor-course-column-container.tsx` → `moduleDndId(course.id, m.id)`; `editor-module-container.tsx` → `moduleDndId(courseId, mod.id)`, `containerDndId(courseId, mod.id)`, `lessonDndId(courseId, l.id)`; `editor-lesson-card-container.tsx` → `lessonDndId(courseId, lesson.id)`; `module-board-container.tsx` → `moduleDndId(courseId, m.id)`; `sortable-module-column.tsx` → `moduleDndId(courseId, mod.id)`; `sortable-lesson-card.tsx` and `lesson-board-container.tsx` → add a `courseId: number` prop and use it (`module-board-container` passes it down).

Consumers: `resolve-drop.ts` — `findModule(board, courseId, moduleId)` finds the course column first, then the module; `findPlacedLesson(board, courseId, lessonId)` likewise; `resolveOverModule` reads `over.courseId`; `resolveDrop` passes `active.courseId`/`over.courseId`. For flat kinds, behaviour is unchanged. `editor-board-updates.ts` — every helper that took `(board, moduleId)` takes `(board, courseId, moduleId)` and scopes to that column. `editor-container.tsx` — wherever it does `parsed.id` for a rail kind it now also has `parsed.courseId`; pass it to the helpers above and to the reorder resolution (Task 6 already carries `courseId`). `module-board-container.tsx` — its inline `resolveOverModuleId`/lookups switch to `parsed.id` as before (single course), and its `parseDndId` results for rail kinds now carry `courseId`, which it can ignore.

Update the fixtures in the three test files to the qualified format (`moduleDndId(courseId, id)` etc.). Everything that constructs a board fixture also needs `owner`/`otherCourseCount`/`remixes` from Task 4 if not already added.

- [ ] **Step 5: Run everything**

Run: `pnpm vitest run && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean. `grep -rn "moduleDndId(\|lessonDndId(\|containerDndId(" src --include='*.ts' --include='*.tsx' | grep -v __tests__` — every call has two arguments.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dnd-ids.ts src/components/admin
git commit -m "refactor(editor): qualify rail drag ids by course so a module can sit on two rails"
```

---

### Task 8: The editor refuses edits that belong to the owner

**Files:**
- Modify: `src/components/admin/resolve-drop.ts`
- Test: `src/components/admin/__tests__/resolve-drop.test.ts`

**Interfaces:**
- Consumes: `module.owner` (Task 4), qualified ids (Task 7).
- Produces: `resolveDrop` returns `forbidden` with an owner-naming reason for any lesson drop into or out of a borrowed module; module reorder within the viewing column stays allowed.

- [ ] **Step 1: Write the failing tests**

```ts
describe('borrowed modules', () => {
  const owner = { id: 6, name: '3D Airmanship' };
  const borrowed = module({ id: 10, name: 'Weather', owner, lessons: [lesson({ id: 55 })] });
  const own = module({ id: 20, name: 'Intro', owner: { id: 2, name: 'ITPS' }, lessons: [lesson({ id: 56 })] });
  const board = [
    courseBoard({ id: 6, name: '3D Airmanship' }, [borrowed]),
    courseBoard({ id: 2, name: 'ITPS' }, [own, borrowed]),
  ];

  it('refuses a library lesson dropped on a borrowed module, naming where it is edited', () => {
    expect(resolveDrop(board, libraryLessonDndId(99), containerDndId(2, 10))).toEqual({
      kind: 'forbidden',
      reason: '"Weather" is edited in 3D Airmanship — ITPS only borrows it. Add the lesson to it from 3D Airmanship’s board, or drop it on one of ITPS’s own modules.',
    });
  });

  it('refuses moving a placed lesson INTO a borrowed module', () => {
    expect(resolveDrop(board, lessonDndId(2, 56), containerDndId(2, 10))).toMatchObject({
      kind: 'forbidden',
      reason: expect.stringContaining('is edited in 3D Airmanship'),
    });
  });

  it('refuses moving a placed lesson OUT OF a borrowed module', () => {
    expect(resolveDrop(board, lessonDndId(2, 55), containerDndId(2, 20))).toEqual({
      kind: 'forbidden',
      reason: '"Weather" is edited in 3D Airmanship — ITPS only borrows it, so its lessons are arranged there.',
    });
  });

  it('still lets the borrowing course reorder the borrowed module on its own rail', () => {
    expect(resolveDrop(board, moduleDndId(2, 10), moduleDndId(2, 20))).toEqual({
      kind: 'reorder-module', courseId: 2, moduleId: 10, overModuleId: 20,
    });
  });

  it('lets the OWNER’s column do everything it could before', () => {
    expect(resolveDrop(board, libraryLessonDndId(99), containerDndId(6, 10))).toEqual({
      kind: 'link', moduleId: 10, lessonId: 99,
    });
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm vitest run src/components/admin/__tests__/resolve-drop.test.ts`
Expected: the three refusals FAIL (resolve to `link`/`move`).

- [ ] **Step 3: Add the refusals**

In `resolve-drop.ts`, add:

```ts
/** True when the module is shown on this course's board but owned elsewhere. */
function isBorrowed(located: LocatedModule): boolean {
  return located.module.owner.id !== located.courseBoard.course.id;
}

/**
 * Why a lesson may not be added to or taken out of a borrowed module here.
 *
 * Content authority follows the OWNER (spec, Permissions row 2): the server
 * would refuse this with a 403 on the owner's course anyway, but a drag that
 * springs back with a bare "Forbidden" leaves the admin with a lesson in hand
 * and no idea where to put it. The sentence names the owner, says what the
 * viewing course's relationship is, and points at the two things that DO
 * work.
 */
function borrowedRefusal(target: LocatedModule, adding: boolean): string {
  const mod = target.module.name;
  const owner = target.module.owner.name;
  const viewing = target.courseBoard.course.name;
  return adding
    ? `"${mod}" is edited in ${owner} — ${viewing} only borrows it. Add the lesson to it from ${owner}’s board, or drop it on one of ${viewing}’s own modules.`
    : `"${mod}" is edited in ${owner} — ${viewing} only borrows it, so its lessons are arranged there.`;
}
```

In the `library-lesson` branch, after `to` is resolved and before returning `link`: `if (isBorrowed(to)) return { kind: 'forbidden', reason: borrowedRefusal(to, true) };`. In the placed-`lesson` branch: after `from` is located, `if (isBorrowed(from)) return { kind: 'forbidden', reason: borrowedRefusal(from, false) };` and after `to` is resolved, `if (isBorrowed(to)) return { kind: 'forbidden', reason: borrowedRefusal(to, true) };` — both before the same-course check so the owner-naming sentence wins over the cross-course one. The `module` branch is untouched.

Also update the two existing module-reorder refusal sentences: "belongs to X" → "is placed in X" (a borrowed module does not *belong* to the viewing course, and the sentence would now be false for it). Update the pinned strings in the test.

- [ ] **Step 4: Run, commit**

Run: `pnpm vitest run src/components/admin/__tests__/resolve-drop.test.ts`
Expected: PASS.

```bash
git add src/components/admin/resolve-drop.ts src/components/admin/__tests__/resolve-drop.test.ts
git commit -m "feat(editor): refuse lesson drops into or out of borrowed modules, naming the owner"
```

---

### Task 9: The "Remix 3D Airmanship" button, its hooks and the un-remix confirm

**Files:**
- Create: `src/lib/flagship-course.ts`, `src/lib/__tests__/flagship-course.test.ts`
- Create: `src/data-hooks/use-remix-course.ts`, `src/data-hooks/__tests__/use-remix-course.test.tsx`
- Modify: `src/atoms/admin.ts` — add `unremixCourseAtom`
- Modify: `src/components/admin/course-column-actions.tsx`, `src/components/admin/__tests__/course-column-actions.test.tsx`
- Modify: `src/components/admin/editor-course-column-container.tsx`, `src/components/admin/editor-container.tsx`
- Create: `src/components/admin/unremix-confirm.tsx`, `src/components/admin/unremix-course-dialog-container.tsx`, `src/components/admin/__tests__/unremix-confirm.test.tsx`

**Interfaces:**
- Produces:
  - `FLAGSHIP_COURSE_SLUG = '3d-airmanship'`; `findFlagshipCourse<C extends { course: { id: number; name: string; slug: string } }>(boards: readonly C[]): C['course'] | null`.
  - `useRemixCourse(): UseMutationResult<{ moduleCount: number }, Error, { courseId: number; sourceCourseId: number }>`; `useUnremixCourse()` same vars/result.
  - `unremixCourseAtom: Atom<{ courseId: number; courseName: string; sourceCourseId: number; sourceName: string; moduleCount: number } | null>`.
  - `CourseColumnActions` prop `remix?: { sourceName: string; isRemixed: boolean; isPending: boolean; onRemix: () => void; onUnremix: () => void }`.

- [ ] **Step 1: Write the failing flagship test**

```ts
// src/lib/__tests__/flagship-course.test.ts
import { describe, expect, it } from 'vitest';
import { FLAGSHIP_COURSE_SLUG, findFlagshipCourse } from '#/lib/flagship-course';

describe('findFlagshipCourse', () => {
  it('finds the course by the flagship slug', () => {
    const boards = [
      { course: { id: 2, name: 'ITPS', slug: 'itps' } },
      { course: { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG } },
    ];
    expect(findFlagshipCourse(boards)).toEqual({ id: 6, name: '3D Airmanship', slug: '3d-airmanship' });
  });
  it('is null when no course carries the slug — the button then renders nowhere', () => {
    expect(findFlagshipCourse([{ course: { id: 2, name: 'ITPS', slug: 'itps' } }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run, then write the constant**

Run: `pnpm vitest run src/lib/__tests__/flagship-course.test.ts` → FAIL.

```ts
// src/lib/flagship-course.ts
/**
 * ORG-SPECIFIC CONFIGURATION — the one place the codebase knows which course
 * is the flagship.
 *
 * The editor's "Remix …" button is pinned to this course rather than opening
 * a picker (spec, Admin UI, amended 2026-09-14): in production 3D Airmanship
 * holds 7 of 9 modules and every other course is an ITPS syllabus built
 * around it, so a picker would list one item. Everything BELOW the button is
 * generic — `remixCourse(courseId, sourceCourseId)`, the routes, the tables
 * — so replacing this constant with a picker touches only the UI.
 *
 * The button's label uses the course's NAME from the board, not this slug,
 * so a rename follows without a deploy. If no course carries this slug the
 * button renders nowhere rather than pointing at nothing.
 */
export const FLAGSHIP_COURSE_SLUG = '3d-airmanship';

export function findFlagshipCourse<
  C extends { course: { id: number; name: string; slug: string } },
>(boards: readonly C[]): C['course'] | null {
  return boards.find((b) => b.course.slug === FLAGSHIP_COURSE_SLUG)?.course ?? null;
}
```

- [ ] **Step 3: Write the failing hook test**

```tsx
// src/data-hooks/__tests__/use-remix-course.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useRemixCourse, useUnremixCourse } from '#/data-hooks/use-remix-course';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ moduleCount: 7 }), { status: 201 }));
});
afterEach(() => vi.unstubAllGlobals());

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useRemixCourse', () => {
  it('POSTs the source to the remixer’s remixes route and invalidates the rail and boards', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRemixCourse(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ courseId: 2, sourceCourseId: 6 });
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/courses/2/remixes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceCourseId: 6 }),
    });
    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(dataKeys.editorBoard()));
      expect(keys).toContain(JSON.stringify(dataKeys.courseBoards()));
      expect(keys).toContain(JSON.stringify(dataKeys.adminCourses()));
    });
  });

  it('surfaces the server’s sentence on failure', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'This course already remixes that one' }), { status: 409 }));
    const client = new QueryClient();
    const { result } = renderHook(() => useRemixCourse(), { wrapper: wrapper(client) });
    await expect(
      act(() => result.current.mutateAsync({ courseId: 2, sourceCourseId: 6 })),
    ).rejects.toThrow('This course already remixes that one');
  });
});

describe('useUnremixCourse', () => {
  it('DELETEs the remixer/source pair', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ moduleCount: 7 }), { status: 200 }));
    const client = new QueryClient();
    const { result } = renderHook(() => useUnremixCourse(), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ courseId: 2, sourceCourseId: 6 });
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/courses/2/remixes/6', { method: 'DELETE' });
  });
});
```

- [ ] **Step 4: Run, then write the hooks**

Run: `pnpm vitest run src/data-hooks/__tests__/use-remix-course.test.tsx` → FAIL.

```ts
// src/data-hooks/use-remix-course.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

interface RemixVars {
  courseId: number;
  sourceCourseId: number;
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return new Error(typeof body?.error === 'string' ? body.error : fallback);
}

/**
 * After either mutation the remixer's rail changed shape: the org editor
 * (`editorBoard`), that course's own board (`courseBoards` prefix — cheaper
 * than threading the id in) and the courses list's module count.
 */
function useInvalidateRemixReaders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: dataKeys.editorBoard() });
    queryClient.invalidateQueries({ queryKey: dataKeys.courseBoards() });
    queryClient.invalidateQueries({ queryKey: dataKeys.adminCourses() });
  };
}

/** Remix `sourceCourseId` into `courseId` — a live link, undone by `useUnremixCourse`. */
export function useRemixCourse() {
  const invalidate = useInvalidateRemixReaders();
  return useMutation({
    mutationFn: async (vars: RemixVars): Promise<{ moduleCount: number }> => {
      const res = await fetch(`/api/admin/courses/${vars.courseId}/remixes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceCourseId: vars.sourceCourseId }),
      });
      if (!res.ok) throw await readError(res, `Failed to remix course (${res.status})`);
      return (await res.json()) as { moduleCount: number };
    },
    onSuccess: invalidate,
  });
}

export function useUnremixCourse() {
  const invalidate = useInvalidateRemixReaders();
  return useMutation({
    mutationFn: async (vars: RemixVars): Promise<{ moduleCount: number }> => {
      const res = await fetch(
        `/api/admin/courses/${vars.courseId}/remixes/${vars.sourceCourseId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw await readError(res, `Failed to un-remix course (${res.status})`);
      return (await res.json()) as { moduleCount: number };
    },
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 5: Write the failing button tests**

Add to `course-column-actions.test.tsx` (extend `renderActions` to accept a `remix` override):

```tsx
describe('remix button', () => {
  it('is absent when no remix source is offered (the flagship’s own column, or no flagship)', () => {
    renderActions();
    expect(screen.queryByRole('button', { name: /remix/i })).toBeNull();
  });

  it('sits FIRST in the bar and offers to remix the source by name', () => {
    const onRemix = vi.fn();
    renderActions({ remix: { sourceName: '3D Airmanship', isRemixed: false, isPending: false, onRemix, onUnremix: vi.fn() } });
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-label')).toBe('Remix 3D Airmanship into 2 Week Intensive');
    expect(buttons[0].textContent).toContain('Remix 3D Airmanship');
    fireEvent.click(buttons[0]);
    expect(onRemix).toHaveBeenCalledOnce();
  });

  it('offers to un-remix once linked, and hands the click to the other callback', () => {
    const onUnremix = vi.fn();
    const onRemix = vi.fn();
    renderActions({ remix: { sourceName: '3D Airmanship', isRemixed: true, isPending: false, onRemix, onUnremix } });
    const button = screen.getByRole('button', { name: 'Un-remix 3D Airmanship from 2 Week Intensive' });
    expect(button.textContent).toContain('Un-remix 3D Airmanship');
    fireEvent.click(button);
    expect(onUnremix).toHaveBeenCalledOnce();
    expect(onRemix).not.toHaveBeenCalled();
  });

  it('is disabled while the request is in flight, and says so', () => {
    renderActions({ remix: { sourceName: '3D Airmanship', isRemixed: false, isPending: true, onRemix: vi.fn(), onUnremix: vi.fn() } });
    const button = screen.getByRole('button', { name: /Remixing 3D Airmanship/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
```

(No jest-dom in this repo — plain DOM property checks, as the file's other tests do.)

- [ ] **Step 6: Run, then write the button**

Run: `pnpm vitest run src/components/admin/__tests__/course-column-actions.test.tsx` → FAIL.

In `course-column-actions.tsx`, import `Button` from `@base-ui/react/button`, `Loader2`, `Shuffle` from `lucide-react`, `cn` from `#/lib/cn`; add the prop and render it first:

```tsx
export const CourseColumnActions = ({
  courseName,
  canEditCourse,
  canDeleteCourse,
  remix,
  onAddModule,
  onEditCourse,
  onDeleteCourse,
}: {
  courseName: string;
  canEditCourse: boolean;
  canDeleteCourse: boolean;
  /**
   * The remix control, when this column may borrow from the flagship
   * (`#/lib/flagship-course`). Absent on the flagship's own column and when
   * no flagship exists. Labelled, not icon-only: it is the one action here
   * whose meaning an icon cannot carry, and it names the course it acts on
   * because the rail holds several columns side by side.
   */
  remix?: {
    sourceName: string;
    isRemixed: boolean;
    isPending: boolean;
    onRemix: () => void;
    onUnremix: () => void;
  };
  onAddModule: () => void;
  onEditCourse: () => void;
  onDeleteCourse: () => void;
}) => (
  <div className="flex items-center gap-0.5">
    {remix && (
      <Button
        type="button"
        disabled={remix.isPending}
        onClick={remix.isRemixed ? remix.onUnremix : remix.onRemix}
        aria-label={
          remix.isPending
            ? `${remix.isRemixed ? 'Un-remixing' : 'Remixing'} ${remix.sourceName}…`
            : remix.isRemixed
              ? `Un-remix ${remix.sourceName} from ${courseName}`
              : `Remix ${remix.sourceName} into ${courseName}`
        }
        className={cn(
          'me-1 inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-60',
          remix.isRemixed
            ? 'bg-apple-3 text-apple-text hover:bg-apple-4'
            : 'bg-gray-3 text-secondary hover:bg-gray-4 hover:text-primary',
        )}
      >
        {remix.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {remix.isRemixed ? 'Un-remix' : 'Remix'} {remix.sourceName}
      </Button>
    )}
    <TooltipIconButton ... (unchanged)
```

- [ ] **Step 7: Write the failing un-remix confirm test**

```tsx
// src/components/admin/__tests__/unremix-confirm.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnremixConfirm } from '../unremix-confirm';

describe('UnremixConfirm', () => {
  it('names how many modules leave, that nothing is deleted, and confirms on the button', () => {
    const onConfirm = vi.fn();
    render(
      <UnremixConfirm
        courseName="ITPS"
        sourceName="3D Airmanship"
        moduleCount={7}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/7 modules from 3D Airmanship will leave ITPS/)).toBeTruthy();
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Un-remix 3D Airmanship' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses the singular for one module', () => {
    render(
      <UnremixConfirm courseName="ITPS" sourceName="3D Airmanship" moduleCount={1} isPending={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(/1 module from 3D Airmanship will leave ITPS/)).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run, then write the confirm and its container**

```tsx
// src/components/admin/unremix-confirm.tsx
import { Loader2, TriangleAlert } from 'lucide-react';

/**
 * Confirmation for un-remixing one source from one course.
 *
 * Lighter than `DeleteConfirmForm`'s typed phrase, for the same reason
 * `NewsSourceDeleteConfirm` is: nothing is destroyed. The borrowed modules
 * stay in their owner and the link can be re-made with one click. What the
 * admin needs to know is HOW MUCH leaves this rail — the count the spec
 * requires — and that the act is reversible, so both are said in the
 * sentence.
 */
export const UnremixConfirm = ({
  courseName,
  sourceName,
  moduleCount,
  isPending,
  onConfirm,
  onCancel,
}: {
  courseName: string;
  sourceName: string;
  moduleCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-start gap-2 rounded-lg border border-warning-7 bg-warning-3 px-3 py-2.5 text-sm text-warning-text">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>
          {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} from {sourceName}
        </strong>{' '}
        will leave {courseName}. Nothing is deleted — {sourceName} keeps them,
        and you can remix it again later.
      </p>
    </div>
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Un-remix {sourceName}
      </button>
    </div>
  </div>
);
```

Atom, in `src/atoms/admin.ts` next to `deleteCourseAtom`:

```ts
/**
 * The un-remix being confirmed. Carries both names and the module count so
 * the dialog can say exactly what leaves which rail without a fetch.
 */
export const unremixCourseAtom = atom<{
  courseId: number;
  courseName: string;
  sourceCourseId: number;
  sourceName: string;
  moduleCount: number;
} | null>(null);
```

Container:

```tsx
// src/components/admin/unremix-course-dialog-container.tsx
import { Dialog } from '@base-ui/react/dialog';
import { useAtom } from 'jotai';
import { toast } from 'sonner';
import { unremixCourseAtom } from '@/atoms/admin';
import { useUnremixCourse } from '@/data-hooks/use-remix-course';
import { UnremixConfirm } from './unremix-confirm';

export const UnremixCourseDialogContainer = () => {
  const [target, setTarget] = useAtom(unremixCourseAtom);
  const unremix = useUnremixCourse();

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      unremix.reset();
    }
  };

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-primary">
            Un-remix {target?.sourceName ?? ''}
          </Dialog.Title>
          <div className="mt-4">
            {target && (
              <UnremixConfirm
                courseName={target.courseName}
                sourceName={target.sourceName}
                moduleCount={target.moduleCount}
                isPending={unremix.isPending}
                onConfirm={() =>
                  unremix.mutate(
                    { courseId: target.courseId, sourceCourseId: target.sourceCourseId },
                    {
                      onSuccess: ({ moduleCount }) => {
                        toast.success(
                          `${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'} left ${target.courseName}`,
                        );
                        onOpenChange(false);
                      },
                      onError: (error) => toast.error(error.message),
                    },
                  )
                }
                onCancel={() => onOpenChange(false)}
              />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
```

- [ ] **Step 9: Wire the column container and the editor**

`editor-course-column-container.tsx` gains a prop `flagship: { id: number; name: string } | null` and builds the `remix` prop:

```tsx
  const remixCourse = useRemixCourse();
  const openUnremix = useSetAtom(unremixCourseAtom);
  const isFlagship = flagship?.id === course.id;
  const isRemixed =
    flagship !== null && courseBoard.remixes.some((r) => r.sourceCourseId === flagship.id);
  const borrowedCount =
    flagship === null ? 0 : modules.filter((m) => m.owner.id === flagship.id).length;
  const remix =
    flagship && !isFlagship
      ? {
          sourceName: flagship.name,
          isRemixed,
          isPending: remixCourse.isPending,
          onRemix: () =>
            remixCourse.mutate(
              { courseId: course.id, sourceCourseId: flagship.id },
              {
                onSuccess: ({ moduleCount }) =>
                  toast.success(
                    `${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'} from ${flagship.name} added to ${course.name}`,
                  ),
                onError: (error) => toast.error(error.message),
              },
            ),
          onUnremix: () =>
            openUnremix({
              courseId: course.id,
              courseName: course.name,
              sourceCourseId: flagship.id,
              sourceName: flagship.name,
              moduleCount: borrowedCount,
            }),
        }
      : undefined;
```

and passes `remix={remix}` to `CourseColumnActions`. `editor-container.tsx`: `const flagship = findFlagshipCourse(board);` above the rail map, pass `flagship={flagship}` to each column, and render `<UnremixCourseDialogContainer />` next to the other dialog containers it already mounts.

- [ ] **Step 10: Run everything**

Run: `pnpm vitest run && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 11: Commit**

```bash
git add src/lib/flagship-course.ts src/lib/__tests__/flagship-course.test.ts src/data-hooks/use-remix-course.ts src/data-hooks/__tests__/use-remix-course.test.tsx src/atoms/admin.ts src/components/admin
git commit -m "feat(editor): one-click Remix / Un-remix of the flagship course on every column"
```

---

### Task 10: Borrowed modules on the org editor — provenance, lock, duplicates

**Files:**
- Create: `src/lib/duplicate-lessons.ts`, `src/lib/__tests__/duplicate-lessons.test.ts`
- Modify: `src/components/admin/module-accordion-item.tsx`, `src/components/admin/__tests__/module-accordion-item.test.tsx`
- Modify: `src/components/admin/editor-module-container.tsx`, `src/components/admin/editor-course-column-container.tsx`, `src/components/admin/editor-lesson-card-container.tsx`
- Modify: `src/components/admin/lesson-card.tsx`, `src/components/admin/__tests__/lesson-card.test.tsx` (create if absent)
- Create: `src/components/admin/borrowed-lesson-list.tsx`

**Interfaces:**
- Produces:
  - `duplicateLessonNotes(modules: ReadonlyArray<{ name: string; lessons: ReadonlyArray<{ id: number }> }>): Map<number, string[]>` — for every lesson id placed in more than one module of the course, the names of the OTHER modules holding it.
  - `ModuleAccordionItem` prop `provenance?: { ownerName: string; editLinkSlot: ReactNode }`.
  - `LessonCard` prop `alsoIn?: string[]` (module names) → renders a `soft-apple` chip "Also in {names}".
  - `BorrowedLessonList({ lessons, posters, alsoIn })` — static cards, no drag, no controls.

- [ ] **Step 1: Write the failing duplicate-notes test**

```ts
// src/lib/__tests__/duplicate-lessons.test.ts
import { describe, expect, it } from 'vitest';
import { duplicateLessonNotes } from '#/lib/duplicate-lessons';

describe('duplicateLessonNotes', () => {
  it('names the OTHER modules holding a lesson placed twice in one course', () => {
    const notes = duplicateLessonNotes([
      { name: 'Intro', lessons: [{ id: 1 }, { id: 2 }] },
      { name: 'Weather', lessons: [{ id: 2 }, { id: 3 }] },
      { name: 'Nav', lessons: [{ id: 2 }] },
    ]);
    expect(notes.get(2)).toEqual(['Intro', 'Weather', 'Nav']);
    expect(notes.has(1)).toBe(false);
  });
});
```

The value is the full list of modules holding the lesson (the caller drops the current module's own name when rendering), so each card can say "Also in Weather, Nav".

- [ ] **Step 2: Run, then write it**

```ts
// src/lib/duplicate-lessons.ts
/**
 * Lessons a course teaches more than once, with every module holding each.
 *
 * Whole-course remixing makes this common — the remixer's own module already
 * teaches a lesson the source's module also teaches — and the spec says to
 * SURFACE it, not block it (`healDuplicatePlacements` exists for exactly this
 * shape). The editor draws a chip on each card; the caller removes the card's
 * own module from the list before rendering.
 */
export function duplicateLessonNotes(
  modules: ReadonlyArray<{ name: string; lessons: ReadonlyArray<{ id: number }> }>,
): Map<number, string[]> {
  const holders = new Map<number, string[]>();
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      holders.set(lesson.id, [...(holders.get(lesson.id) ?? []), mod.name]);
    }
  }
  return new Map([...holders].filter(([, names]) => names.length > 1));
}
```

- [ ] **Step 3: Write the failing accordion-item test**

Add to `module-accordion-item.test.tsx` (use its existing render helper):

```tsx
  it('states where a borrowed module is edited, in text and in the link’s name', () => {
    renderItem({
      provenance: {
        ownerName: '3D Airmanship',
        editLinkSlot: (
          <a href="/admin/6/editor" aria-label="Edited in 3D Airmanship — open its board to change this module">
            Edited in 3D Airmanship
          </a>
        ),
      },
    });
    expect(screen.getByText('from 3D Airmanship')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Edited in 3D Airmanship — open its board/ })).toBeTruthy();
  });

  it('draws no provenance for a module the course owns', () => {
    renderItem({});
    expect(screen.queryByText(/^from /)).toBeNull();
  });
```

- [ ] **Step 4: Run, then extend `ModuleAccordionItem`**

Add the prop to `ModuleAccordionItemProps`:

```ts
  /**
   * Present when the module is BORROWED through a remix. `ownerName` is drawn
   * as a chip; `editLinkSlot` is the router link the container builds (this
   * component is hookless), and it carries the reason and the remedy in its
   * accessible name — the codebase's rule for any withheld control.
   */
  provenance?: { ownerName: string; editLinkSlot: ReactNode };
```

Render, inside the header row after the lesson-count span and before the action buttons:

```tsx
        {provenance && (
          <span className="flex shrink-0 items-center gap-1.5">
            <Chip tone="soft-apple">from {provenance.ownerName}</Chip>
            {provenance.editLinkSlot}
          </span>
        )}
```

(`import { Chip } from '#/components/ui/chip'` — `Chip({ children, tone, className })`; `soft-apple` is its cross-reference tone.)

- [ ] **Step 5: Lesson card chip and the static list**

`lesson-card.tsx`: add prop `alsoIn?: string[]` and, next to `quickshotSlot`, render when non-empty:

```tsx
      {alsoIn && alsoIn.length > 0 && (
        <Chip tone="soft-apple">Also in {alsoIn.join(', ')}</Chip>
      )}
```

Test (new or existing `lesson-card.test.tsx`): renders `Also in Weather, Nav` for `alsoIn={['Weather','Nav']}` and nothing for `[]`.

```tsx
// src/components/admin/borrowed-lesson-list.tsx
import type { EditorBoardLesson } from '#/lib/admin-schemas';
import { LessonCard } from './lesson-card';

/**
 * The lessons of a BORROWED module, drawn read-only.
 *
 * No `useSortable`, no remove, no delete: those all edit the module's
 * content, which belongs to its owner. Not the same card component with the
 * handlers left off — `EditorLessonCardContainer` registers a dnd sortable
 * unconditionally (hooks cannot be conditional), and a registered sortable
 * that refuses every drop is a control that looks live and is not.
 */
export const BorrowedLessonList = ({
  lessons,
  posters,
  alsoIn,
}: {
  lessons: readonly EditorBoardLesson[];
  posters?: Record<number, string | null>;
  alsoIn: ReadonlyMap<number, string[]>;
}) => (
  <>
    {lessons.map((lesson) => (
      <LessonCard
        key={lesson.id}
        lesson={lesson}
        posterUrl={posters?.[lesson.id]}
        alsoIn={alsoIn.get(lesson.id)}
      />
    ))}
  </>
);
```

`LessonCard`'s `lesson` is `LessonCardLesson = Pick<BoardLesson, 'name' | 'isAvailable' | 'isConfigured'>`, which an `EditorBoardLesson` satisfies.

- [ ] **Step 6: Wire the module container and column**

`editor-course-column-container.tsx`: `const alsoIn = duplicateLessonNotes(modules);` and pass `alsoIn={alsoIn}` to each `EditorModuleContainer`.

`editor-module-container.tsx`: add props `alsoIn: ReadonlyMap<number, string[]>` and build provenance when `mod.owner.id !== courseId`:

```tsx
  const borrowed = mod.owner.id !== courseId;
  const provenance = borrowed
    ? {
        ownerName: mod.owner.name,
        editLinkSlot: (
          <Link
            to="/admin/$courseId/editor"
            params={{ courseId: String(mod.owner.id) }}
            aria-label={`Edited in ${mod.owner.name} — open its board to change this module`}
            className="text-apple-text text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            Edited in {mod.owner.name}
          </Link>
        ),
      }
    : undefined;
```

Pass `provenance={provenance}` to `ModuleAccordionItem`. For `lessonsSlot`, when `borrowed` render `<BorrowedLessonList lessons={mod.lessons} posters={posters} alsoIn={alsoIn} />` (no `SortableContext`, no empty drop zone — an empty borrowed module says `No lessons yet — add them in {owner}.` in a plain `<p className="px-3 py-2 text-tertiary text-xs">`); otherwise the existing sortable list, with `alsoIn={alsoIn.get(lesson.id)?.filter((n) => n !== mod.name)}` threaded through `EditorLessonCardContainer` to `LessonCard`. In `BorrowedLessonList` the caller-side filter is the same: pass `alsoIn` already filtered per module, i.e. build `const alsoInForModule = new Map([...alsoIn].map(([id, names]) => [id, names.filter((n) => n !== mod.name)]))` in the module container and hand that to both branches.

- [ ] **Step 7: Run everything**

Run: `pnpm vitest run && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/duplicate-lessons.ts src/lib/__tests__/duplicate-lessons.test.ts src/components/admin
git commit -m "feat(editor): borrowed modules show provenance, lock their lessons, and flag duplicate lessons"
```

---

### Task 11: Borrowed modules on the per-course board, and the delete dialog's count

**Files:**
- Modify: `src/components/admin/sortable-module-column.tsx`, `src/components/admin/module-column.tsx`
- Modify: `src/atoms/admin.ts` — `deleteModuleAtom` gains `otherCourseCount`
- Modify: `src/components/admin/delete-module-dialog-container.tsx`
- Test: `src/components/admin/__tests__/module-column.test.tsx` (create if absent), `src/components/admin/__tests__/delete-module-dialog.test.tsx` (create if absent, jsdom + jotai `Provider` + a `QueryClientProvider`)

**Interfaces:**
- Produces: `ModuleColumn` prop `provenance?: { ownerName: string; editLinkSlot: ReactNode }`; `deleteModuleAtom: Atom<{ id: number; name: string; otherCourseCount: number } | null>`.

- [ ] **Step 1: Write the failing column test**

```tsx
// src/components/admin/__tests__/module-column.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleColumn } from '../module-column';

vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" aria-label={label} onClick={onClick}>{label}</button>
  ),
}));

const mod = {
  id: 10, name: 'Weather', slug: 'weather', imageUrlAvif: null, imageUrlWebp: null, rank: 1,
  requiredSubscriptions: [], dependsOn: [], sequentialLessons: true, learnerCount: 0,
  owner: { id: 6, name: '3D Airmanship' }, otherCourseCount: 1, lessons: [],
};

describe('ModuleColumn for a borrowed module', () => {
  it('shows provenance and the edit link, and offers no add/edit/delete controls', () => {
    render(
      <ModuleColumn
        module={mod}
        provenance={{
          ownerName: '3D Airmanship',
          editLinkSlot: <a href="/admin/6/editor" aria-label="Edited in 3D Airmanship — open its board to change this module">Edited in 3D Airmanship</a>,
        }}
      />,
    );
    expect(screen.getByText('from 3D Airmanship')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Edited in 3D Airmanship/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add lesson|Edit module|Delete module/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, then extend `ModuleColumn` and `SortableModuleColumn`**

`module-column.tsx`: add `provenance?: { ownerName: string; editLinkSlot: ReactNode }` and render the same chip + slot as `ModuleAccordionItem` in its header. `sortable-module-column.tsx`:

```tsx
  const borrowed = mod.owner.id !== courseId;
  const provenance = borrowed
    ? {
        ownerName: mod.owner.name,
        editLinkSlot: (
          <Link
            to="/admin/$courseId/editor"
            params={{ courseId: String(mod.owner.id) }}
            aria-label={`Edited in ${mod.owner.name} — open its board to change this module`}
            className="text-apple-text text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            Edited in {mod.owner.name}
          </Link>
        ),
      }
    : undefined;
```

When `borrowed`: pass `provenance`, keep `dragHandleProps` (position is this course's), and pass **no** `onAddLesson`/`onEditModule`/`onDeleteModule` and **no** `lessonsSlot` — `ModuleColumn`'s static fallback list (the one the drag overlay uses) then draws the lessons read-only from `posters`. When not borrowed, everything as today, plus `otherCourseCount: mod.otherCourseCount` in the `setDeleteModule({...})` call.

- [ ] **Step 3: The delete dialog says who else loses the module**

`deleteModuleAtom` type gains `otherCourseCount: number`. Every `setDeleteModule(...)`/`openDeleteModule(...)` caller passes it (`grep -rn "deleteModuleAtom" src --include='*.tsx'`). In `delete-module-dialog-container.tsx`, the warning becomes:

```tsx
                <>
                  Deleting{' '}
                  <span className="font-medium text-primary">{target?.name ?? ''}</span>{' '}
                  will permanently delete the module and all of its lessons.
                  {target && target.otherCourseCount > 0 && (
                    <>
                      {' '}It is also shown in{' '}
                      <span className="font-medium text-primary">
                        {target.otherCourseCount} other{' '}
                        {target.otherCourseCount === 1 ? 'course' : 'courses'}
                      </span>
                      , which will lose it too.
                    </>
                  )}{' '}
                  This can't be undone.
                </>
```

Test: render the container inside a jotai `Provider` whose store has `deleteModuleAtom` set to `{ id: 10, name: 'Weather', otherCourseCount: 2 }` (and a `QueryClientProvider`); assert `screen.getByText(/also shown in/)` and `screen.getByText('2 other courses')`. With `otherCourseCount: 0`, `queryByText(/also shown in/)` is null.

- [ ] **Step 4: Run everything**

Run: `pnpm vitest run && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/atoms/admin.ts src/components/admin
git commit -m "feat(admin): lock borrowed modules on the course board; delete dialog counts other courses"
```

---

### Task 12: Walk it in the browser

Not a code task; a verification gate before merge. Run `pnpm dev` (port 5001 — see memory) and, as an admin:

1. Open the knowledge editor. The ITPS columns each show **Remix 3D Airmanship** at the start of their action bar; the 3D Airmanship column shows no such button.
2. Click it on "ITPS 2 Week…". Expect a toast "7 modules from 3D Airmanship added to …" and seven cards appended, each with a **from 3D Airmanship** chip and an **Edited in 3D Airmanship** link; the button now reads **Un-remix 3D Airmanship**.
3. Drag a borrowed module above ITPS's own module. Reload: the order holds on ITPS, and 3D Airmanship's column is unchanged.
4. Drag a library lesson onto a borrowed module: a toast naming 3D Airmanship, nothing moves.
5. In 3D Airmanship's column, create a module: it appears at the end of ITPS's rail too.
6. Open `/admin/6/editor` (3D Airmanship's board) → delete that module: the dialog says "also shown in 1 other course". Confirm; it leaves ITPS.
7. Try to delete the 3D Airmanship course: refused with "1 other course remixes this course…".
8. Log in as (or impersonate) a learner enrolled in ITPS: the course page shows one flat module list; the network tab's `/api/course/details` response has no `courseId`, `owner` or `source*` key on any module.
9. Un-remix: the dialog says "7 modules from 3D Airmanship will leave …"; confirm; the rail is back to ITPS's own module.

Any step failing is a bug in the task that owns it; fix there, not with a patch on top.

---

## Done when

- `course_remixes` exists in `information_schema` with CASCADE on `course_id` and RESTRICT on `source_course_id`.
- Every test in the spec's groups 2–6 has a red-then-green history in this branch's commits; group 1 is covered by Plan 1's single membership helper (see the note under Global Constraints).
- `grep -rn "moduleDndId(\|lessonDndId(\|containerDndId(" src | grep -v __tests__` shows only two-argument calls.
- The only file that mentions `3d-airmanship` as a string is `src/lib/flagship-course.ts`.
- `toLearnerCourseDetails` strips `courseId` from modules and the test pins it.
- The Task 12 walkthrough passes end to end.
