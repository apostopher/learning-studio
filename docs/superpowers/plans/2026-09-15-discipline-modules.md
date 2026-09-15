# Discipline Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a discipline hold named, ordered modules that group its lessons in the library pane — a lesson sits in at most one, or in the discipline's Untitled group — with drag-to-arrange, and no change to anything a learner sees.

**Architecture:** A new `discipline_modules` table and two nullable columns on `lessons` (`discipline_module_id`, `library_rank`); a purely additive migration, so every existing lesson appears in its discipline's Untitled group. `getOrgLibrary` groups lessons per discipline into `modules[]` + `untitled`; the flat `discipline.lessons` list is replaced by one helper, `disciplineLessons()`. Four routes under the lesson-content guard on the discipline. The library pane draws each discipline as an accordion of modules with the course rail's `ModuleAccordionItem` shell; `resolveDrop` learns `library-move` and `reorder-library-module`; optimistic updates on the library query with drag-start rollback, like the rail.

**Tech Stack:** Drizzle ORM + PostgreSQL (Neon), TanStack Start/Router, TanStack Query, Jotai, dnd-kit, Base UI, react-hook-form + zod, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-15-discipline-modules-design.md`

## Global Constraints

- **No data is touched.** The migration adds one table and two nullable columns; it updates and deletes no row. No write in this feature deletes a lesson: deleting a module returns its lessons to Untitled by `on delete set null`.
- **Never trust `schema.ts` about the live database.** Migrations are hand-written idempotent scripts in `src/db/migrate-*.ts` following `migrate-course-remixes.ts`; verify against `information_schema`. Never `drizzle-kit push`.
- **Authority** for every write is `requireLessonContentPermission(disciplineId, action)` after `findDisciplineInOrg(getActiveOrgId(), disciplineId)` — the discipline routes' existing order, so an unowned id reads as not found. The library-placement route guards on the **lesson's** discipline; the module routes on the **module's**.
- **Invariant:** a lesson's module belongs to the lesson's own discipline; the placement writer refuses otherwise with a 400 naming both disciplines.
- **Names:** the module-less group in a discipline is **Untitled** (the org-level column of discipline-less lessons keeps its name). Empty Untitled reads "Every lesson is in a module".
- Discipline modules never reach a learner payload, never gate, never remix.
- Vitest cannot resolve `@/` — `#/` in anything a test imports. Presentational components hookless; router `Link`s reach them as slots. No jest-dom.
- Tests assert on what the consumer received (rendered SQL via `renderSql` `toBe`, guard args, fetch bodies, rendered text/roles); every test seen red before its implementation. Route tests pin **which discipline id** each guard received.
- Colours: semantic tokens only. Drag ids for library kinds stay flat: `library-lesson-<id>`, `library-module-<id>`, `library-container-<id>`, `library-untitled-<disciplineId>`.

---

### Task 1: `discipline_modules` table, lesson columns, migration

**Files:**
- Modify: `src/db/schema.ts` (after `disciplinesTable` ~line 300; `lessonsTable` ~line 366)
- Create: `src/db/migrate-discipline-modules.ts`
- Modify: `package.json` scripts (after `db:migrate-course-remixes`)
- Test: `src/db/__tests__/migrate-discipline-modules.test.ts`

**Interfaces:**
- Produces: `disciplineModulesTable` (`id`, `disciplineId`, `name`, `rank`, `createdAt`, `updatedAt`); `lessonsTable.disciplineModuleId: integer | null`, `lessonsTable.libraryRank: numeric | null`; `migrateDisciplineModules(): Promise<'created' | 'exists'>`.

- [ ] **Step 1: Write the failing migration test**

```ts
// src/db/__tests__/migrate-discipline-modules.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock('#/db', () => ({ db }));

const { migrateDisciplineModules } = await import('#/db/migrate-discipline-modules');

type Query = { queryChunks?: Array<{ value?: unknown }> };

/** Same house pattern as migrate-course-remixes.test.ts. */
function textOf(query: Query): string {
  return (query.queryChunks ?? [])
    .map((chunk) => (Array.isArray(chunk.value) ? chunk.value.join('') : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

beforeEach(() => vi.clearAllMocks());

describe('migrateDisciplineModules', () => {
  it('no-ops when discipline_modules already exists, without opening a transaction', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: true }] });
    expect(await migrateDisciplineModules()).toBe('exists');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  /**
   * The two `on delete` clauses ARE the no-data-loss guarantee: a deleted
   * module sets its lessons' column to null (they return to Untitled); a
   * deleted discipline takes its (already empty — deleteDiscipline refuses
   * while lessons remain) modules with it. Pinned as exact text. Both new
   * lesson columns are nullable and have no default: no row is rewritten.
   */
  it('creates the table and the two nullable lesson columns in one transaction, with SET NULL on the lesson side', async () => {
    db.execute.mockResolvedValueOnce({ rows: [{ exists: false }] });
    const executed: string[] = [];
    db.transaction.mockImplementation(
      async (fn: (tx: { execute: (q: Query) => Promise<unknown> }) => Promise<void>) => {
        await fn({ execute: async (q) => { executed.push(textOf(q)); return { rows: [] }; } });
      },
    );

    expect(await migrateDisciplineModules()).toBe('created');
    expect(executed[0]).toBe(
      'create table "discipline_modules" ( "id" integer primary key generated always as identity, "discipline_id" integer not null references "disciplines"("id") on delete cascade, "name" text not null, "rank" numeric(30,15) not null, "created_at" timestamp not null default now(), "updated_at" timestamp not null default now() )',
    );
    expect(executed[1]).toBe(
      'create index "discipline_modules_discipline_id_idx" on "discipline_modules" ("discipline_id")',
    );
    expect(executed[2]).toBe(
      'alter table "lessons" add column if not exists "discipline_module_id" integer references "discipline_modules"("id") on delete set null',
    );
    expect(executed[3]).toBe(
      'alter table "lessons" add column if not exists "library_rank" numeric(30,15)',
    );
    expect(executed[4]).toBe(
      'create index if not exists "lessons_discipline_module_id_idx" on "lessons" ("discipline_module_id")',
    );
    expect(executed).toHaveLength(5);
    // Nothing that could touch a row.
    for (const statement of executed) {
      expect(statement).not.toMatch(/^(update|delete|insert)/);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/migrate-discipline-modules.test.ts`
Expected: FAIL — cannot resolve `#/db/migrate-discipline-modules`.

- [ ] **Step 3: Add the table and columns to `schema.ts`**

After `disciplinesTable` (and its `dbDisciplineSchema` exports):

```ts
/**
 * `discipline_modules` — how the library is FILED, not what a course
 * teaches.
 *
 * A discipline may hold named, ordered modules and a lesson in that
 * discipline sits in at most one of them (`lessons.discipline_module_id`),
 * or in none — its discipline's "Untitled" group. Nothing here reaches a
 * learner, gates anything, or travels on a remix; `course_modules` and
 * `module_lessons` are untouched. `rank` orders modules within the
 * discipline. Deleting a module sets its lessons' column to null: a box is
 * thrown away, never its contents.
 */
export const disciplineModulesTable = pgTable(
  'discipline_modules',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    disciplineId: integer('discipline_id')
      .notNull()
      .references(() => disciplinesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rank: numeric('rank', { precision: 30, scale: 15 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('discipline_modules_discipline_id_idx').on(table.disciplineId),
  ],
);
```

In `lessonsTable`, after `disciplineId`:

```ts
  /**
   * The discipline module this lesson is filed in, or null for its
   * discipline's Untitled group. Must belong to `disciplineId`'s discipline
   * — enforced by `placeLessonInLibrary`, the one write that sets it.
   */
  disciplineModuleId: integer('discipline_module_id').references(
    () => disciplineModulesTable.id,
    { onDelete: 'set null' },
  ),
  /**
   * Order within its discipline module (or within Untitled). Null until the
   * lesson is first dragged; unranked lessons sort after ranked ones, by id.
   */
  libraryRank: numeric('library_rank', { precision: 30, scale: 15 }),
```

`disciplineModulesTable` must be declared before `lessonsTable` references it in a lambda — a lambda is fine either way; keep the table near `disciplinesTable`. Add the index to `lessonsTable`'s index list if it has one (`grep -n "index('lessons_" src/db/schema.ts`); if the table has no third argument, add one: `(table) => [index('lessons_discipline_module_id_idx').on(table.disciplineModuleId)]`.

- [ ] **Step 4: Write the migration script**

```ts
// src/db/migrate-discipline-modules.ts
import { sql } from 'drizzle-orm';
import { db } from '#/db';

/**
 * Discipline modules (spec: docs/superpowers/specs/2026-09-15-discipline-
 * modules-design.md): one new table and two NULLABLE lesson columns.
 *
 * Purely additive — no row is updated or deleted, no default is written —
 * so every existing lesson simply appears in its discipline's Untitled
 * group afterwards, and this can run before or after the code deploys.
 * Idempotent: `to_regclass` on the table, `if not exists` on the columns
 * and index, matching `migrate-course-remixes.ts`.
 *
 * Run: pnpm db:migrate-discipline-modules
 */
export async function migrateDisciplineModules(): Promise<'created' | 'exists'> {
  const { rows } = await db.execute<{ exists: boolean }>(
    sql`select to_regclass(${'public.discipline_modules'}) is not null as exists`,
  );
  if (rows[0]?.exists === true) return 'exists';

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      create table "discipline_modules" (
        "id" integer primary key generated always as identity,
        "discipline_id" integer not null references "disciplines"("id") on delete cascade,
        "name" text not null,
        "rank" numeric(30,15) not null,
        "created_at" timestamp not null default now(),
        "updated_at" timestamp not null default now()
      )`);
    await tx.execute(sql`
      create index "discipline_modules_discipline_id_idx" on "discipline_modules" ("discipline_id")`);
    await tx.execute(sql`
      alter table "lessons" add column if not exists "discipline_module_id" integer references "discipline_modules"("id") on delete set null`);
    await tx.execute(sql`
      alter table "lessons" add column if not exists "library_rank" numeric(30,15)`);
    await tx.execute(sql`
      create index if not exists "lessons_discipline_module_id_idx" on "lessons" ("discipline_module_id")`);
  });
  return 'created';
}

async function main() {
  const outcome = await migrateDisciplineModules();
  console.log(
    outcome === 'exists'
      ? 'discipline_modules already exists — nothing to do.'
      : 'discipline_modules created; lessons.discipline_module_id and lessons.library_rank added.',
  );
  process.exit(0);
}

if (process.argv[1]?.endsWith('migrate-discipline-modules.ts')) {
  await main();
}
```

- [ ] **Step 5: Package script, run tests, typecheck**

`package.json`, after `db:migrate-course-remixes`:

```json
    "db:migrate-discipline-modules": "dotenv -e .env.local -- tsx src/db/migrate-discipline-modules.ts",
```

Run: `pnpm vitest run src/db/__tests__/migrate-discipline-modules.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS, clean. Whitespace mismatches are fixed in the **script's** SQL, not the test.

- [ ] **Step 6: Run the migration and verify against the live schema**

Run: `pnpm db:migrate-discipline-modules` → `discipline_modules created; …`.

Verify (write to `src/db/__check.tmp.mts`, run with `pnpm exec dotenv -e .env.local -- tsx src/db/__check.tmp.mts`, delete after):

```ts
import { sql } from 'drizzle-orm';
import { db } from './index';
console.log((await db.execute(sql`
  select column_name, is_nullable, data_type from information_schema.columns
  where table_name = 'lessons' and column_name in ('discipline_module_id','library_rank')`)).rows);
console.log((await db.execute(sql`
  select rc.delete_rule, kcu.column_name from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu on kcu.constraint_name = rc.constraint_name
  where kcu.table_name in ('lessons','discipline_modules') and kcu.column_name in ('discipline_module_id','discipline_id')`)).rows);
console.log((await db.execute(sql`select count(*)::int as lessons, count(discipline_module_id)::int as filed from lessons`)).rows);
process.exit(0);
```

Expected: both columns `YES` nullable; `discipline_module_id → SET NULL`, `discipline_id → CASCADE` (the disciplines FK on lessons, `NO ACTION`, may also list — that is pre-existing); `filed` = 0 and `lessons` = the count from before. Re-run the migration → `already exists — nothing to do.`

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/migrate-discipline-modules.ts src/db/__tests__/migrate-discipline-modules.test.ts package.json
git commit -m "feat(db): discipline_modules table and the two nullable lesson columns that file a lesson"
```

---

### Task 2: The discipline-module writers

**Files:**
- Create: `src/db/discipline-modules.ts`
- Test: `src/db/__tests__/discipline-modules.test.ts`

**Interfaces:**
- Consumes: `disciplineModulesTable`, `lessonsTable`, `disciplinesTable`.
- Produces:
  - `createDisciplineModule(disciplineId: number, name: string): Promise<{ id: number; name: string; rank: number }>`
  - `renameDisciplineModule(id: number, name: string): Promise<{ id: number; name: string } | null>`
  - `reorderDisciplineModule(input: { moduleId: number; prevModuleId: number | null; nextModuleId: number | null }): Promise<{ id: number; rank: number } | null>` — neighbours resolved **within the module's own discipline**; a neighbour elsewhere yields `null`.
  - `deleteDisciplineModule(id: number): Promise<{ ok: true; lessonsReturned: number } | { ok: false; reason: 'not-found' }>`
  - `placeLessonInLibrary(input: { lessonId: number; disciplineModuleId: number | null; prevLessonId: number | null; nextLessonId: number | null }): Promise<PlaceLessonResult>` with `PlaceLessonResult = { ok: true; rank: number } | { ok: false; reason: 'not-found' } | { ok: false; reason: 'wrong-discipline'; lessonDiscipline: string; moduleDiscipline: string }`
  - `getDisciplineIdForDisciplineModule(id: number): Promise<number | null>`
  - `countLessonsInDisciplineModule(id: number): Promise<number>`

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/discipline-modules.test.ts
// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * A builder double in the shape of course-remixes.test.ts's: every method
 * returns the chain; `then` resolves the next queued result; selects,
 * inserts, updates and deletes are recorded with what they were handed.
 */
const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    selects: [] as Array<{ from: unknown; where: unknown }>,
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; set: unknown; where: unknown }>,
    deletes: [] as Array<{ table: unknown; where: unknown }>,
  };
  function chain(kind: 'select' | 'insert' | 'update' | 'delete', table?: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    const rec: Record<string, unknown> = { table };
    for (const name of ['select', 'from', 'where', 'orderBy', 'values', 'set', 'returning', 'limit', 'innerJoin', 'leftJoin']) {
      c[name] = (...args: unknown[]) => {
        if (name === 'from') rec.from = args[0];
        if (name === 'where') rec.where = args[0];
        if (name === 'values') rec.values = args[0];
        if (name === 'set') rec.set = args[0];
        return c;
      };
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (kind === 'select') state.selects.push(rec as never);
      if (kind === 'insert') state.inserts.push(rec as never);
      if (kind === 'update') state.updates.push(rec as never);
      if (kind === 'delete') state.deletes.push(rec as never);
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  const db = {
    select: () => chain('select'),
    insert: (t: unknown) => chain('insert', t),
    update: (t: unknown) => chain('update', t),
    delete: (t: unknown) => chain('delete', t),
  };
  return { state, db };
});
vi.mock('#/db', () => ({ db: fake.db }));

const {
  createDisciplineModule, reorderDisciplineModule, deleteDisciplineModule,
  placeLessonInLibrary, getDisciplineIdForDisciplineModule,
} = await import('../discipline-modules');
const { disciplineModulesTable, lessonsTable } = await import('../schema');

beforeEach(() => {
  fake.state.results.length = 0;
  fake.state.selects.length = 0;
  fake.state.inserts.length = 0;
  fake.state.updates.length = 0;
  fake.state.deletes.length = 0;
});

describe('createDisciplineModule', () => {
  it('appends after the discipline’s last module', async () => {
    fake.state.results.push([{ maxRank: '3' }]);
    fake.state.results.push([{ id: 5, name: 'Basics', rank: '4' }]);
    const created = await createDisciplineModule(4, 'Basics');
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe('"discipline_modules"."discipline_id" = $1');
    expect(renderSqlParams(fake.state.selects[0].where as SQL)).toEqual([4]);
    expect(fake.state.inserts[0].table).toBe(disciplineModulesTable);
    expect(fake.state.inserts[0].values).toEqual({ disciplineId: 4, name: 'Basics', rank: '4' });
    expect(created).toEqual({ id: 5, name: 'Basics', rank: 4 });
  });
});

describe('reorderDisciplineModule', () => {
  /**
   * Mutant this catches: neighbour ranks read by module id alone. A prev
   * from another discipline would then hand this module a rank in the
   * wrong list, and the two disciplines' orders would interleave.
   */
  it('reads each neighbour’s rank only within the module’s own discipline, and pins the update to the module', async () => {
    fake.state.results.push([{ disciplineId: 4 }]); // the module's discipline
    fake.state.results.push([{ id: 7, rank: '2.5' }]); // update … returning
    const out = await reorderDisciplineModule({ moduleId: 7, prevModuleId: 6, nextModuleId: 8 });
    const upd = fake.state.updates[0];
    expect(upd.table).toBe(disciplineModulesTable);
    expect(renderSql(upd.where as SQL)).toBe('"discipline_modules"."id" = $1');
    expect(renderSqlParams(upd.where as SQL)).toEqual([7]);
    const rank = (upd.set as { rank: SQL }).rank;
    expect(renderSql(rank)).toBe(
      '((select "discipline_modules"."rank" from "discipline_modules" where "discipline_modules"."id" = $1 and "discipline_modules"."discipline_id" = $2) + (select "discipline_modules"."rank" from "discipline_modules" where "discipline_modules"."id" = $3 and "discipline_modules"."discipline_id" = $4)) / 2',
    );
    expect(renderSqlParams(rank)).toEqual([6, 4, 8, 4]);
    expect(out).toEqual({ id: 7, rank: 2.5 });
  });

  it('answers null for an unknown module without writing', async () => {
    fake.state.results.push([]);
    expect(await reorderDisciplineModule({ moduleId: 7, prevModuleId: 6, nextModuleId: null })).toBeNull();
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe('deleteDisciplineModule', () => {
  it('counts the lessons that return to Untitled, deletes only the module row, and never a lesson', async () => {
    fake.state.results.push([{ n: 3 }]);
    fake.state.results.push([{ id: 7 }]);
    const out = await deleteDisciplineModule(7);
    expect(out).toEqual({ ok: true, lessonsReturned: 3 });
    expect(fake.state.deletes).toHaveLength(1);
    expect(fake.state.deletes[0].table).toBe(disciplineModulesTable);
    expect(renderSql(fake.state.deletes[0].where as SQL)).toBe('"discipline_modules"."id" = $1');
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe('placeLessonInLibrary', () => {
  it('refuses a module of another discipline, naming both, and writes nothing', async () => {
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]); // lesson
    fake.state.results.push([{ disciplineId: 9, disciplineName: 'Navigation' }]); // module
    const out = await placeLessonInLibrary({ lessonId: 10, disciplineModuleId: 7, prevLessonId: null, nextLessonId: null });
    expect(out).toEqual({ ok: false, reason: 'wrong-discipline', lessonDiscipline: 'Weather', moduleDiscipline: 'Navigation' });
    expect(fake.state.updates).toHaveLength(0);
  });

  /**
   * Mutant this catches: a neighbour's rank read without scoping it to the
   * same module (or to Untitled of the same discipline) — a rank borrowed
   * from another box places the lesson in the wrong order there.
   */
  it('sets the module and a midpoint library_rank between neighbours IN THAT MODULE, pinned to the one lesson', async () => {
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]);
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]);
    fake.state.results.push([{ id: 10, libraryRank: '1.5' }]);
    const out = await placeLessonInLibrary({ lessonId: 10, disciplineModuleId: 7, prevLessonId: 11, nextLessonId: 12 });
    const upd = fake.state.updates[0];
    expect(upd.table).toBe(lessonsTable);
    expect(renderSql(upd.where as SQL)).toBe('"lessons"."id" = $1');
    const set = upd.set as { disciplineModuleId: number | null; libraryRank: SQL };
    expect(set.disciplineModuleId).toBe(7);
    expect(renderSql(set.libraryRank)).toBe(
      '((select "lessons"."library_rank" from "lessons" where "lessons"."id" = $1 and "lessons"."discipline_module_id" = $2) + (select "lessons"."library_rank" from "lessons" where "lessons"."id" = $3 and "lessons"."discipline_module_id" = $4)) / 2',
    );
    expect(renderSqlParams(set.libraryRank)).toEqual([11, 7, 12, 7]);
    expect(out).toEqual({ ok: true, rank: 1.5 });
  });

  it('files into Untitled (null module) scoped to the lesson’s discipline, appending after the last', async () => {
    fake.state.results.push([{ disciplineId: 4, disciplineName: 'Weather' }]);
    fake.state.results.push([{ id: 10, libraryRank: '3' }]);
    const out = await placeLessonInLibrary({ lessonId: 10, disciplineModuleId: null, prevLessonId: 11, nextLessonId: null });
    const set = fake.state.updates[0].set as { disciplineModuleId: number | null; libraryRank: SQL };
    expect(set.disciplineModuleId).toBeNull();
    expect(renderSql(set.libraryRank)).toBe(
      '(select "lessons"."library_rank" from "lessons" where "lessons"."id" = $1 and "lessons"."discipline_module_id" is null and "lessons"."discipline_id" = $2) + 1',
    );
    expect(renderSqlParams(set.libraryRank)).toEqual([11, 4]);
    expect(out).toEqual({ ok: true, rank: 3 });
  });

  it('answers not-found for an unknown lesson', async () => {
    fake.state.results.push([]);
    expect(await placeLessonInLibrary({ lessonId: 10, disciplineModuleId: null, prevLessonId: null, nextLessonId: null })).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('getDisciplineIdForDisciplineModule', () => {
  it('reads the module’s discipline', async () => {
    fake.state.results.push([{ disciplineId: 4 }]);
    expect(await getDisciplineIdForDisciplineModule(7)).toBe(4);
    expect(renderSql(fake.state.selects[0].where as SQL)).toBe('"discipline_modules"."id" = $1');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/db/__tests__/discipline-modules.test.ts` → FAIL, cannot resolve.

- [ ] **Step 3: Write the writers**

```ts
// src/db/discipline-modules.ts
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import { disciplineModulesTable, disciplinesTable, lessonsTable } from '#/db/schema';

/**
 * Discipline modules: how a discipline's lessons are FILED in the library
 * pane. Nothing here touches a course, a placement, or a learner. Every
 * writer is guarded by its route on the discipline — the module's for module
 * writes, the LESSON's for `placeLessonInLibrary`.
 */

export async function createDisciplineModule(
  disciplineId: number,
  name: string,
): Promise<{ id: number; name: string; rank: number }> {
  // Appended after the discipline's last module — the same rule as
  // `createModule`, so a new box lands where it is visible.
  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${disciplineModulesTable.rank})` })
    .from(disciplineModulesTable)
    .where(eq(disciplineModulesTable.disciplineId, disciplineId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;
  const [created] = await db
    .insert(disciplineModulesTable)
    .values({ disciplineId, name, rank: String(rank) })
    .returning({
      id: disciplineModulesTable.id,
      name: disciplineModulesTable.name,
      rank: disciplineModulesTable.rank,
    });
  return { id: created.id, name: created.name, rank: Number(created.rank) };
}

export async function renameDisciplineModule(
  id: number,
  name: string,
): Promise<{ id: number; name: string } | null> {
  const [updated] = await db
    .update(disciplineModulesTable)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(disciplineModulesTable.id, id))
    .returning({ id: disciplineModulesTable.id, name: disciplineModulesTable.name });
  return updated ?? null;
}

/** The discipline a module belongs to, or null for no such module. */
export async function getDisciplineIdForDisciplineModule(
  id: number,
): Promise<number | null> {
  const [row] = await db
    .select({ disciplineId: disciplineModulesTable.disciplineId })
    .from(disciplineModulesTable)
    .where(eq(disciplineModulesTable.id, id));
  return row?.disciplineId ?? null;
}

/**
 * Move a module between two neighbours OF ITS OWN DISCIPLINE. Neighbour
 * ranks are scalar subqueries scoped to that discipline, so a neighbour id
 * from another discipline resolves to NULL and the update writes nothing —
 * the two disciplines' orders can never interleave. Mirrors `reorderModule`.
 */
export async function reorderDisciplineModule(input: {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}): Promise<{ id: number; rank: number } | null> {
  const disciplineId = await getDisciplineIdForDisciplineModule(input.moduleId);
  if (disciplineId === null) return null;
  const rankOf = (id: number) =>
    sql`(select ${disciplineModulesTable.rank} from ${disciplineModulesTable} where ${disciplineModulesTable.id} = ${id} and ${disciplineModulesTable.disciplineId} = ${disciplineId})`;
  const prev = input.prevModuleId ? rankOf(input.prevModuleId) : null;
  const next = input.nextModuleId ? rankOf(input.nextModuleId) : null;
  let rankExpr: SQL;
  if (prev && next) rankExpr = sql`(${prev} + ${next}) / 2`;
  else if (next) rankExpr = sql`${next} / 2`;
  else if (prev) rankExpr = sql`${prev} + 1`;
  else return null;
  const [updated] = await db
    .update(disciplineModulesTable)
    .set({ rank: rankExpr, updatedAt: sql`now()` })
    .where(eq(disciplineModulesTable.id, input.moduleId))
    .returning({ id: disciplineModulesTable.id, rank: disciplineModulesTable.rank });
  if (!updated || updated.rank === null) return null;
  return { id: updated.id, rank: Number(updated.rank) };
}

export async function countLessonsInDisciplineModule(id: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessonsTable)
    .where(eq(lessonsTable.disciplineModuleId, id));
  return Number(row?.n ?? 0);
}

/**
 * Delete the module ROW. Its lessons are not touched by this function at
 * all — the foreign key's `on delete set null` returns them to their
 * discipline's Untitled group. The count is what the confirm dialog quotes.
 */
export async function deleteDisciplineModule(
  id: number,
): Promise<{ ok: true; lessonsReturned: number } | { ok: false; reason: 'not-found' }> {
  const lessonsReturned = await countLessonsInDisciplineModule(id);
  const deleted = await db
    .delete(disciplineModulesTable)
    .where(eq(disciplineModulesTable.id, id))
    .returning({ id: disciplineModulesTable.id });
  if (deleted.length === 0) return { ok: false, reason: 'not-found' };
  return { ok: true, lessonsReturned };
}

export type PlaceLessonResult =
  | { ok: true; rank: number }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'wrong-discipline'; lessonDiscipline: string; moduleDiscipline: string };

/**
 * File a lesson: into a module (`disciplineModuleId`) or back to its
 * discipline's Untitled group (`null`), at a midpoint `library_rank`
 * between the named neighbours.
 *
 * The one invariant this feature has — a lesson's module belongs to the
 * lesson's own discipline — is enforced here, the only write that sets the
 * column, by reading both disciplines first and refusing with both names.
 * Neighbour ranks are scoped to the SAME box (module, or Untitled of the
 * same discipline), so a stale neighbour id from elsewhere yields NULL and
 * nothing is written rather than a rank borrowed from another list.
 */
export async function placeLessonInLibrary(input: {
  lessonId: number;
  disciplineModuleId: number | null;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<PlaceLessonResult> {
  const [lesson] = await db
    .select({
      disciplineId: lessonsTable.disciplineId,
      disciplineName: disciplinesTable.name,
    })
    .from(lessonsTable)
    .leftJoin(disciplinesTable, eq(disciplinesTable.id, lessonsTable.disciplineId))
    .where(eq(lessonsTable.id, input.lessonId));
  if (!lesson) return { ok: false, reason: 'not-found' };

  if (input.disciplineModuleId !== null) {
    const [module] = await db
      .select({
        disciplineId: disciplineModulesTable.disciplineId,
        disciplineName: disciplinesTable.name,
      })
      .from(disciplineModulesTable)
      .innerJoin(disciplinesTable, eq(disciplinesTable.id, disciplineModulesTable.disciplineId))
      .where(eq(disciplineModulesTable.id, input.disciplineModuleId));
    if (!module) return { ok: false, reason: 'not-found' };
    if (module.disciplineId !== lesson.disciplineId) {
      return {
        ok: false,
        reason: 'wrong-discipline',
        lessonDiscipline: lesson.disciplineName ?? 'Untitled',
        moduleDiscipline: module.disciplineName,
      };
    }
  }

  // Neighbours live in the SAME box as the destination.
  const inBox =
    input.disciplineModuleId === null
      ? sql`${lessonsTable.disciplineModuleId} is null and ${lessonsTable.disciplineId} = ${lesson.disciplineId}`
      : sql`${lessonsTable.disciplineModuleId} = ${input.disciplineModuleId}`;
  const rankOf = (id: number) =>
    sql`(select ${lessonsTable.libraryRank} from ${lessonsTable} where ${lessonsTable.id} = ${id} and ${inBox})`;
  const prev = input.prevLessonId ? rankOf(input.prevLessonId) : null;
  const next = input.nextLessonId ? rankOf(input.nextLessonId) : null;
  let rankExpr: SQL;
  if (prev && next) rankExpr = sql`(${prev} + ${next}) / 2`;
  else if (next) rankExpr = sql`${next} / 2`;
  else if (prev) rankExpr = sql`${prev} + 1`;
  // An empty box: rank 1.
  else rankExpr = sql`1`;

  const [updated] = await db
    .update(lessonsTable)
    .set({
      disciplineModuleId: input.disciplineModuleId,
      libraryRank: rankExpr,
      updatedAt: sql`now()`,
    })
    .where(eq(lessonsTable.id, input.lessonId))
    .returning({ id: lessonsTable.id, libraryRank: lessonsTable.libraryRank });
  if (!updated) return { ok: false, reason: 'not-found' };
  return { ok: true, rank: Number(updated.libraryRank) };
}
```

Check `lessonsTable` has `updatedAt` (`grep -n "updatedAt" src/db/schema.ts | head`); if not, drop that field from both `.set()`s. A neighbour whose rank is `NULL` (never dragged) makes the midpoint `NULL`; that is the "stale neighbour → 404" path for a **module**, but for lessons an unranked neighbour is legitimate: coalesce it — `coalesce((select …), 0)` in `rankOf` for lessons — so the first drag beside a never-dragged lesson still lands. Update the two rendered strings in the test to include `coalesce(…, 0)` if you take this path (recommended: take it; the unranked-neighbour case is the normal case on day one).

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/db/__tests__/discipline-modules.test.ts` → PASS (adjust the expected SQL strings to the real rendered text only where whitespace/parenthesisation differs; the pairing of ids and scopes must match).

- [ ] **Step 5: Commit**

```bash
git add src/db/discipline-modules.ts src/db/__tests__/discipline-modules.test.ts
git commit -m "feat(db): create, rename, reorder, delete discipline modules; file a lesson into one"
```

---

### Task 3: The library payload groups by module

**Files:**
- Modify: `src/lib/admin-schemas.ts` — `libraryLessonSchema` (~922), `libraryDisciplineSchema` (~973), add `libraryDisciplineModuleSchema` and `disciplineLessons`
- Modify: `src/db/editor.ts` — `getOrgLibrary`
- Modify: `src/db/library-lessons.ts` (the created card gains `disciplineModuleId: null`)
- Modify every reader of `discipline.lessons`: `src/components/admin/library-lesson-config-dialog-container.tsx` (`findLesson`), `src/components/admin/editor-container.tsx` (`findLibraryLesson`, the two `DisciplineColumnContainer` render sites keep working via Task 7 — for now pass `disciplineLessons(discipline)`), `src/components/admin/resolve-drop.ts` if it reads the library (it does not yet), tests and fixtures
- Test: `src/db/__tests__/editor-queries.test.ts` (extend), `src/lib/__tests__/discipline-lessons.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const libraryDisciplineModuleSchema = z.object({ id: z.number(), name: z.string(), rank: z.number(), lessons: z.array(libraryLessonSchema) });
  export type LibraryDisciplineModule = z.infer<typeof libraryDisciplineModuleSchema>;
  // libraryDisciplineSchema: { id, name, slug, modules: LibraryDisciplineModule[], untitled: LibraryLesson[] }  (no `lessons`)
  // libraryLessonSchema gains disciplineModuleId: z.number().nullable()
  export function disciplineLessons(d: { modules: { lessons: LibraryLesson[] }[]; untitled: LibraryLesson[] }): LibraryLesson[]
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/discipline-lessons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { disciplineLessons } from '#/lib/admin-schemas';

describe('disciplineLessons', () => {
  /**
   * The ONE definition of "which lessons are in this discipline" now that
   * the flat list is gone: every module's lessons in module order, then
   * Untitled. Mutant: forgetting `untitled`, which drops every existing
   * lesson from the dialog's lookup on day one.
   */
  it('walks every module in order, then Untitled, dropping nothing', () => {
    const l = (id: number) => ({ id }) as never;
    const d = {
      modules: [{ lessons: [l(3), l(1)] }, { lessons: [l(2)] }],
      untitled: [l(9), l(4)],
    };
    expect(disciplineLessons(d).map((x: { id: number }) => x.id)).toEqual([3, 1, 2, 9, 4]);
  });
});
```

Extend `src/db/__tests__/editor-queries.test.ts` — `getOrgLibrary` now issues a THIRD select (discipline modules); the harness's `makeChain` queue needs one more entry per test. Add:

```ts
  it('groups a discipline’s lessons by module in rank order, then Untitled, each in library_rank order with unranked last', async () => {
    db.select
      .mockReturnValueOnce(makeChain([
        // lessons: (id, name, slug, isAvailable, videoRef, videoProvider, disciplineId, disciplineName, disciplineSlug, disciplineModuleId, libraryRank)
        row({ id: 1, disciplineId: 4, disciplineModuleId: 7, libraryRank: '2' }),
        row({ id: 2, disciplineId: 4, disciplineModuleId: 7, libraryRank: '1' }),
        row({ id: 3, disciplineId: 4, disciplineModuleId: null, libraryRank: null }),
        row({ id: 5, disciplineId: 4, disciplineModuleId: null, libraryRank: '0.5' }),
        row({ id: 6, disciplineId: 4, disciplineModuleId: 8, libraryRank: null }),
      ]))
      .mockReturnValueOnce(makeChain([{ id: 4, name: 'Weather', slug: 'weather' }]))
      .mockReturnValueOnce(makeChain([
        { id: 8, disciplineId: 4, name: 'Advanced', rank: '2' },
        { id: 7, disciplineId: 4, name: 'Basics', rank: '1' },
      ]));
    mockGetCourseIds.mockResolvedValue(new Map());

    const lib = await getOrgLibrary(1);
    const weather = lib.disciplines[0];
    expect(weather.modules.map((m) => [m.id, m.lessons.map((l) => l.id)])).toEqual([
      [7, [2, 1]],
      [8, [6]],
    ]);
    expect(weather.untitled.map((l) => l.id)).toEqual([5, 3]);
    expect(weather.untitled[0].disciplineModuleId).toBeNull();
    expect(weather.modules[0].lessons[0].disciplineModuleId).toBe(7);
    // Every lesson exactly once.
    const all = [...weather.modules.flatMap((m) => m.lessons), ...weather.untitled].map((l) => l.id).sort();
    expect(all).toEqual([1, 2, 3, 5, 6]);
    expect(Object.hasOwn(weather, 'lessons')).toBe(false);
  });

  it('a module with no lessons is still a box', async () => {
    db.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([{ id: 4, name: 'Weather', slug: 'weather' }]))
      .mockReturnValueOnce(makeChain([{ id: 7, disciplineId: 4, name: 'Basics', rank: '1' }]));
    mockGetCourseIds.mockResolvedValue(new Map());
    const lib = await getOrgLibrary(1);
    expect(lib.disciplines[0].modules).toEqual([{ id: 7, name: 'Basics', rank: 1, lessons: [] }]);
    expect(lib.disciplines[0].untitled).toEqual([]);
  });
```

where `row(over)` is a small local helper spreading the file's existing lesson-row shape (`name: 'L', slug: 'l', isAvailable: true, videoRef: null, videoProvider: null, disciplineName: 'Weather', disciplineSlug: 'weather', levels: [], requiredSubscriptions: [], hasDebrief: false, needsVideoWatch: false`) with `over`. Every other `getOrgLibrary` test in the file gains a third `.mockReturnValueOnce(makeChain([]))` for the modules query — the report must say which tests were touched and that only the queue changed.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run src/lib/__tests__/discipline-lessons.test.ts src/db/__tests__/editor-queries.test.ts` → FAIL.

- [ ] **Step 3: Schemas and helper**

In `admin-schemas.ts`, add to `libraryLessonSchema` (after `videoProvider`):

```ts
  /**
   * The discipline module this lesson is filed in, or null for its
   * discipline's Untitled group. Library furniture only — never a course
   * concept, never sent to a learner.
   */
  disciplineModuleId: z.number().nullable(),
```

Replace `libraryDisciplineSchema`:

```ts
/** One box on a discipline's shelf: a named, ordered group of its lessons. */
export const libraryDisciplineModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  rank: z.number(),
  lessons: z.array(libraryLessonSchema),
});
export type LibraryDisciplineModule = z.infer<typeof libraryDisciplineModuleSchema>;

export const libraryDisciplineSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  /** In rank order. */
  modules: z.array(libraryDisciplineModuleSchema),
  /**
   * Lessons in this discipline that sit in no module — where every lesson
   * starts. Not to be confused with the org-level `untitled` below (lessons
   * with no discipline at all).
   */
  untitled: z.array(libraryLessonSchema),
});
export type LibraryDiscipline = z.infer<typeof libraryDisciplineSchema>;

/**
 * Every lesson in a discipline, in display order: each module's lessons in
 * module order, then Untitled. The ONE definition — the flat `lessons`
 * list was removed so the pane and the drop resolver cannot disagree about
 * membership.
 */
export function disciplineLessons<L>(discipline: {
  modules: ReadonlyArray<{ lessons: ReadonlyArray<L> }>;
  untitled: ReadonlyArray<L>;
}): L[] {
  return [...discipline.modules.flatMap((m) => [...m.lessons]), ...discipline.untitled];
}
```

- [ ] **Step 4: `getOrgLibrary`**

Add `disciplineModuleId: lessonsTable.disciplineModuleId, libraryRank: lessonsTable.libraryRank` to the lesson select; add a third query in the `Promise.all`:

```ts
    db
      .select({
        id: disciplineModulesTable.id,
        disciplineId: disciplineModulesTable.disciplineId,
        name: disciplineModulesTable.name,
        rank: disciplineModulesTable.rank,
      })
      .from(disciplineModulesTable)
      .innerJoin(disciplinesTable, eq(disciplinesTable.id, disciplineModulesTable.disciplineId))
      .where(eq(disciplinesTable.orgId, orgId))
      .orderBy(asc(disciplineModulesTable.rank), asc(disciplineModulesTable.id)),
```

Seed each `LibraryDiscipline` with `modules: []` and `untitled: []`, then file module rows into their discipline (creating the discipline entry the same way the seeding does for a lesson whose discipline the seed missed). File each lesson card (now carrying `disciplineModuleId`) into `modules.find(m => m.id === card.disciplineModuleId)?.lessons ?? discipline.untitled`. Finally sort every module's `lessons` and each `untitled` with:

```ts
/** `library_rank` ascending, unranked (never dragged) last, then id. */
function byLibraryOrder(a: { id: number; libraryRank: number | null }, b: typeof a): number {
  if (a.libraryRank === null && b.libraryRank === null) return a.id - b.id;
  if (a.libraryRank === null) return 1;
  if (b.libraryRank === null) return -1;
  return a.libraryRank - b.libraryRank || a.id - b.id;
}
```

Keep `libraryRank` OUT of the emitted `LibraryLesson` (sort with it, then strip — the card does not read it and the schema does not declare it). `untitled` (org-level) is built exactly as before. `library-lessons.ts`'s created card gains `disciplineModuleId: null`.

- [ ] **Step 5: Readers**

`library-lesson-config-dialog-container.tsx` `findLesson`: `...library.disciplines.flatMap(disciplineLessons)`. `editor-container.tsx` `findLibraryLesson`: same. The two `DisciplineColumnContainer` sites: pass `lessons={disciplineLessons(discipline)}` for now (Task 7 replaces the prop). Fixtures: `pnpm exec tsc --noEmit -p .` lists every `LibraryLesson`/`LibraryDiscipline` fixture — add `disciplineModuleId: null` to lessons; replace `lessons: [...]` on discipline fixtures with `modules: [], untitled: [...]`.

- [ ] **Step 6: Run everything**

Run: `pnpm vitest run && pnpm exec tsc --noEmit -p .` → PASS, clean. `grep -rn "\.lessons" src --include='*.ts' --include='*.tsx' | grep -i "discipline\b\|disciplines\[" | grep -v __tests__` must show no reader of a discipline's flat list.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin-schemas.ts src/db/editor.ts src/db/library-lessons.ts src/lib/__tests__/discipline-lessons.test.ts src/db/__tests__/editor-queries.test.ts src/components src/data-hooks
git commit -m "feat(library): the library payload groups each discipline's lessons by module, then Untitled"
```

---

### Task 4: Routes

**Files:**
- Modify: `src/lib/admin-schemas.ts` — input schemas
- Create: `src/routes/api/admin/disciplines.$disciplineId.modules.ts`, `src/routes/api/admin/discipline-modules.$moduleId.ts`, `src/routes/api/admin/lessons.$lessonId.library-placement.ts`
- Modify: `src/routeTree.gen.ts` (regenerated — see Plan 2's note: `pnpm dev` briefly or the router generator; commit it, never hand-edit)
- Test: `src/routes/api/admin/__tests__/discipline-modules-routes.test.ts`

**Interfaces:**
- Consumes: Task 2 writers; `findDisciplineInOrg` (`#/db/disciplines`); `getDisciplineIdForLessonId` (`#/db/lesson-access`); `requireLessonContentPermission`, `absentResourceResponse` (`#/lib/permissions.server`); `getActiveOrgId` (`#/lib/active-org.server`); `ForbiddenError` (`#/lib/admin-functions.server`).
- Produces schemas:
  ```ts
  export const createDisciplineModuleInputSchema = z.object({ name: z.string().trim().min(1).max(120) });
  export const renameDisciplineModuleInputSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
  export const reorderDisciplineModuleInputSchema = z.object({ prevModuleId: z.number().int().positive().nullable(), nextModuleId: z.number().int().positive().nullable() }).strict().refine((v) => v.prevModuleId !== null || v.nextModuleId !== null, { message: 'At least one neighbor is required' });
  export const libraryPlacementInputSchema = z.object({ disciplineModuleId: z.number().int().positive().nullable(), prevLessonId: z.number().int().positive().nullable(), nextLessonId: z.number().int().positive().nullable() }).strict();
  ```

- [ ] **Step 1: Write the failing route tests**

```ts
// src/routes/api/admin/__tests__/discipline-modules-routes.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error { constructor() { super('Forbidden'); this.name = 'ForbiddenError'; } }
  return {
    ForbiddenError,
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(() => new Response('Not found', { status: 404 })),
    getActiveOrgId: vi.fn(() => 1),
    findDisciplineInOrg: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    createDisciplineModule: vi.fn(),
    renameDisciplineModule: vi.fn(),
    reorderDisciplineModule: vi.fn(),
    deleteDisciplineModule: vi.fn(),
    placeLessonInLibrary: vi.fn(),
    getDisciplineIdForDisciplineModule: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError: m.ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: m.getActiveOrgId }));
vi.mock('#/db/disciplines', () => ({ findDisciplineInOrg: m.findDisciplineInOrg }));
vi.mock('#/db/lesson-access', () => ({ getDisciplineIdForLessonId: m.getDisciplineIdForLessonId }));
vi.mock('#/db/discipline-modules', () => ({
  createDisciplineModule: m.createDisciplineModule,
  renameDisciplineModule: m.renameDisciplineModule,
  reorderDisciplineModule: m.reorderDisciplineModule,
  deleteDisciplineModule: m.deleteDisciplineModule,
  placeLessonInLibrary: m.placeLessonInLibrary,
  getDisciplineIdForDisciplineModule: m.getDisciplineIdForDisciplineModule,
}));

import { postDisciplineModuleHandler } from '../disciplines.$disciplineId.modules';
import { deleteDisciplineModuleHandler, patchDisciplineModuleHandler } from '../discipline-modules.$moduleId';
import { patchLibraryPlacementHandler } from '../lessons.$lessonId.library-placement';

const json = (method: string, body?: unknown) =>
  new Request('http://t/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.findDisciplineInOrg.mockResolvedValue({ id: 4 });
  m.getDisciplineIdForDisciplineModule.mockResolvedValue(4);
  m.getDisciplineIdForLessonId.mockResolvedValue({ found: true, disciplineId: 4 });
});

describe('POST /api/admin/disciplines/:id/modules', () => {
  it('checks org ownership, then asks for content:create on THAT discipline, then creates', async () => {
    m.createDisciplineModule.mockResolvedValue({ id: 7, name: 'Basics', rank: 1 });
    const res = await postDisciplineModuleHandler(json('POST', { name: 'Basics' }), '4');
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(expect.anything(), 4, 'create');
    expect(m.createDisciplineModule).toHaveBeenCalledWith(4, 'Basics');
    expect(res.status).toBe(201);
  });
  it('404s an unowned discipline before guarding', async () => {
    m.findDisciplineInOrg.mockResolvedValue(null);
    const res = await postDisciplineModuleHandler(json('POST', { name: 'Basics' }), '4');
    expect(res.status).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });
  it('403s when refused, without creating', async () => {
    m.requireLessonContentPermission.mockRejectedValue(new m.ForbiddenError());
    expect((await postDisciplineModuleHandler(json('POST', { name: 'Basics' }), '4')).status).toBe(403);
    expect(m.createDisciplineModule).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/discipline-modules/:id', () => {
  /**
   * The bug shape: guarding on a discipline id from the BODY or the URL
   * rather than the one the module actually belongs to. Pinned as the
   * argument the guard received.
   */
  it('resolves the module’s discipline, checks ownership there, guards content:update, and renames', async () => {
    m.renameDisciplineModule.mockResolvedValue({ id: 7, name: 'Fundamentals' });
    const res = await patchDisciplineModuleHandler(json('PATCH', { name: 'Fundamentals' }), '7');
    expect(m.getDisciplineIdForDisciplineModule).toHaveBeenCalledWith(7);
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(expect.anything(), 4, 'update');
    expect(m.renameDisciplineModule).toHaveBeenCalledWith(7, 'Fundamentals');
    expect(res.status).toBe(200);
  });
  it('routes a neighbour body to the reorder writer and 404s when the neighbour is not in the discipline', async () => {
    m.reorderDisciplineModule.mockResolvedValue(null);
    const res = await patchDisciplineModuleHandler(json('PATCH', { prevModuleId: 6, nextModuleId: null }), '7');
    expect(m.reorderDisciplineModule).toHaveBeenCalledWith({ moduleId: 7, prevModuleId: 6, nextModuleId: null });
    expect(res.status).toBe(404);
  });
  it('404s an unknown module before guarding', async () => {
    m.getDisciplineIdForDisciplineModule.mockResolvedValue(null);
    expect((await patchDisciplineModuleHandler(json('PATCH', { name: 'x' }), '7')).status).toBe(404);
    expect(m.requireLessonContentPermission).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/discipline-modules/:id', () => {
  it('guards content:delete on the module’s discipline and 204s, reporting how many lessons returned to Untitled in a header', async () => {
    m.deleteDisciplineModule.mockResolvedValue({ ok: true, lessonsReturned: 3 });
    const res = await deleteDisciplineModuleHandler(json('DELETE'), '7');
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(expect.anything(), 4, 'delete');
    expect(res.status).toBe(204);
  });
});

describe('PATCH /api/admin/lessons/:id/library-placement', () => {
  /**
   * Guarded on the LESSON's discipline, never the target module's: the
   * writer refuses a module of another discipline anyway, but the guard
   * must not be reachable by naming a module the actor happens to hold.
   */
  it('guards content:update on the lesson’s discipline and files the lesson', async () => {
    m.placeLessonInLibrary.mockResolvedValue({ ok: true, rank: 1.5 });
    const res = await patchLibraryPlacementHandler(
      json('PATCH', { disciplineModuleId: 7, prevLessonId: 11, nextLessonId: null }), '10',
    );
    expect(m.getDisciplineIdForLessonId).toHaveBeenCalledWith(10);
    expect(m.findDisciplineInOrg).toHaveBeenCalledWith(1, 4);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(expect.anything(), 4, 'update');
    expect(m.placeLessonInLibrary).toHaveBeenCalledWith({ lessonId: 10, disciplineModuleId: 7, prevLessonId: 11, nextLessonId: null });
    expect(res.status).toBe(200);
  });
  it('400s a module of another discipline, naming both', async () => {
    m.placeLessonInLibrary.mockResolvedValue({ ok: false, reason: 'wrong-discipline', lessonDiscipline: 'Weather', moduleDiscipline: 'Navigation' });
    const res = await patchLibraryPlacementHandler(json('PATCH', { disciplineModuleId: 7, prevLessonId: null, nextLessonId: null }), '10');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'This lesson is in Weather; that module is in Navigation. Lessons stay in their discipline — file it into one of Weather’s modules.',
    });
  });
  it('an Untitled (null) lesson has no discipline to guard — 404, and nothing is written', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({ found: true, disciplineId: null });
    const res = await patchLibraryPlacementHandler(json('PATCH', { disciplineModuleId: null, prevLessonId: null, nextLessonId: null }), '10');
    expect(res.status).toBe(404);
    expect(m.placeLessonInLibrary).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and watch them fail** → cannot resolve the three route modules.

- [ ] **Step 3: Schemas + routes**

Add the four input schemas from Interfaces to `admin-schemas.ts` next to `createModuleInputSchema`.

```ts
// src/routes/api/admin/disciplines.$disciplineId.modules.ts
import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createDisciplineModule } from '#/db/discipline-modules';
import { findDisciplineInOrg } from '#/db/disciplines';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { createDisciplineModuleInputSchema } from '#/lib/admin-schemas';
import { absentResourceResponse, requireLessonContentPermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Add a module to a discipline's shelf. Same ordering as the sibling
 * `disciplines.$disciplineId.lessons.ts`: ownership BEFORE the guard so an
 * unowned id reads as not found, then `requireLessonContentPermission` —
 * the one chokepoint for "who may change this discipline's content".
 */
export async function postDisciplineModuleHandler(request: Request, disciplineIdRaw: string): Promise<Response> {
  const disciplineId = parseId(disciplineIdRaw);
  if (disciplineId === null) return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  if (!(await findDisciplineInOrg(getActiveOrgId(), disciplineId))) {
    return absentResourceResponse(request.headers, 'Discipline not found');
  }
  try {
    await requireLessonContentPermission(request.headers, disciplineId, 'create');
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw error;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = createDisciplineModuleInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  return Response.json(await createDisciplineModule(disciplineId, parsed.data.name), { status: 201 });
}

export const Route = createFileRoute('/api/admin/disciplines/$disciplineId/modules')({
  server: { handlers: { POST: ({ request, params }) => postDisciplineModuleHandler(request, params.disciplineId) } },
});
```

```ts
// src/routes/api/admin/discipline-modules.$moduleId.ts
import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: see the sibling routes.
import {
  deleteDisciplineModule, getDisciplineIdForDisciplineModule,
  renameDisciplineModule, reorderDisciplineModule,
} from '#/db/discipline-modules';
import { findDisciplineInOrg } from '#/db/disciplines';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { renameDisciplineModuleInputSchema, reorderDisciplineModuleInputSchema } from '#/lib/admin-schemas';
import { absentResourceResponse, requireLessonContentPermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The module's DISCIPLINE is resolved first and everything — ownership,
 * guard — hangs off it. A body cannot name a discipline; the module says
 * whose it is.
 */
async function admit(request: Request, moduleId: number, action: 'update' | 'delete'): Promise<Response | null> {
  const disciplineId = await getDisciplineIdForDisciplineModule(moduleId);
  if (disciplineId === null) return absentResourceResponse(request.headers, 'Module not found');
  if (!(await findDisciplineInOrg(getActiveOrgId(), disciplineId))) {
    return absentResourceResponse(request.headers, 'Module not found');
  }
  try {
    await requireLessonContentPermission(request.headers, disciplineId, action);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw error;
  }
}

export async function patchDisciplineModuleHandler(request: Request, moduleIdRaw: string): Promise<Response> {
  const moduleId = parseId(moduleIdRaw);
  if (moduleId === null) return Response.json({ error: 'Invalid module id' }, { status: 400 });
  const denied = await admit(request, moduleId, 'update');
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const reorder = reorderDisciplineModuleInputSchema.safeParse(body);
  if (reorder.success) {
    const updated = await reorderDisciplineModule({ moduleId, ...reorder.data });
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }
  const rename = renameDisciplineModuleInputSchema.safeParse(body);
  if (rename.success) {
    const updated = await renameDisciplineModule(moduleId, rename.data.name);
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }
  return Response.json({ error: 'Invalid body' }, { status: 400 });
}

/** Deletes the module ROW; its lessons return to Untitled (FK `set null`). */
export async function deleteDisciplineModuleHandler(request: Request, moduleIdRaw: string): Promise<Response> {
  const moduleId = parseId(moduleIdRaw);
  if (moduleId === null) return Response.json({ error: 'Invalid module id' }, { status: 400 });
  const denied = await admit(request, moduleId, 'delete');
  if (denied) return denied;
  const result = await deleteDisciplineModule(moduleId);
  if (!result.ok) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/discipline-modules/$moduleId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) => patchDisciplineModuleHandler(request, params.moduleId),
      DELETE: ({ request, params }) => deleteDisciplineModuleHandler(request, params.moduleId),
    },
  },
});
```

```ts
// src/routes/api/admin/lessons.$lessonId.library-placement.ts
import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: see the sibling routes.
import { placeLessonInLibrary } from '#/db/discipline-modules';
import { findDisciplineInOrg } from '#/db/disciplines';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { libraryPlacementInputSchema } from '#/lib/admin-schemas';
import { absentResourceResponse, requireLessonContentPermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * File a lesson into a discipline module, or back to Untitled, at a
 * position. Guarded on the LESSON's discipline — the shelf being
 * rearranged — never on the target module's: the writer refuses a module of
 * another discipline regardless, and the guard must not be satisfiable by
 * naming a module the actor happens to hold. A lesson with no discipline
 * (the org-level Untitled column) has no shelf and no modules: 404.
 */
export async function patchLibraryPlacementHandler(request: Request, lessonIdRaw: string): Promise<Response> {
  const lessonId = parseId(lessonIdRaw);
  if (lessonId === null) return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found || lookup.disciplineId === null) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  if (!(await findDisciplineInOrg(getActiveOrgId(), lookup.disciplineId))) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(request.headers, lookup.disciplineId, 'update');
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw error;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = libraryPlacementInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await placeLessonInLibrary({ lessonId, ...parsed.data });
  if (result.ok) return Response.json(result);
  if (result.reason === 'wrong-discipline') {
    return Response.json(
      {
        error: `This lesson is in ${result.lessonDiscipline}; that module is in ${result.moduleDiscipline}. Lessons stay in their discipline — file it into one of ${result.lessonDiscipline}’s modules.`,
      },
      { status: 400 },
    );
  }
  return new Response('Not found', { status: 404 });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/library-placement')({
  server: { handlers: { PATCH: ({ request, params }) => patchLibraryPlacementHandler(request, params.lessonId) } },
});
```

- [ ] **Step 4: Run tests, regenerate the route tree, typecheck, commit**

Run: `pnpm vitest run src/routes/api/admin/__tests__/discipline-modules-routes.test.ts`, regenerate `src/routeTree.gen.ts` (as in Plan 2 Task 5), `pnpm exec tsc --noEmit -p .`.

```bash
git add src/lib/admin-schemas.ts 'src/routes/api/admin/disciplines.$disciplineId.modules.ts' 'src/routes/api/admin/discipline-modules.$moduleId.ts' 'src/routes/api/admin/lessons.$lessonId.library-placement.ts' src/routes/api/admin/__tests__/discipline-modules-routes.test.ts src/routeTree.gen.ts
git commit -m "feat(api): discipline module routes and the library-placement route, guarded on the right discipline"
```

---

### Task 5: Data hooks

**Files:**
- Create: `src/data-hooks/use-discipline-modules.ts`
- Test: `src/data-hooks/__tests__/use-discipline-modules.test.tsx`

**Interfaces:**
- Produces (all invalidate `dataKeys.orgLibrary()`; placement/reorder on **settled**, the rest on success — the same reasoning as `useMovePlacement` vs `useLinkLesson`):
  - `useCreateDisciplineModule()` — vars `{ disciplineId, name }`, POST `/api/admin/disciplines/${disciplineId}/modules`
  - `useRenameDisciplineModule()` — vars `{ moduleId, name }`, PATCH `/api/admin/discipline-modules/${moduleId}`
  - `useReorderDisciplineModule()` — vars `{ moduleId, prevModuleId, nextModuleId }`, PATCH same route
  - `useDeleteDisciplineModule()` — vars `{ moduleId }`, DELETE
  - `usePlaceLibraryLesson()` — vars `{ lessonId, disciplineModuleId, prevLessonId, nextLessonId }`, PATCH `/api/admin/lessons/${lessonId}/library-placement`
  - Errors surface the server's `error` sentence (JSON) or `Failed to … (status)`; a 403 reads `Only an admin or one of this discipline’s subject experts can organise it.`

- [ ] **Step 1: Write the failing test**

```tsx
// src/data-hooks/__tests__/use-discipline-modules.test.tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  useCreateDisciplineModule, useDeleteDisciplineModule, usePlaceLibraryLesson,
  useRenameDisciplineModule, useReorderDisciplineModule,
} from '#/data-hooks/use-discipline-modules';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}
const invalidatedLibrary = (invalidate: ReturnType<typeof vi.spyOn>) =>
  invalidate.mock.calls.some(([arg]) => JSON.stringify((arg as { queryKey?: unknown })?.queryKey) === JSON.stringify(dataKeys.orgLibrary()));

describe('discipline module hooks', () => {
  it('creates a module in a discipline and refreshes the library', async () => {
    const { wrapper, invalidate } = harness();
    const { result } = renderHook(() => useCreateDisciplineModule(), { wrapper });
    await act(() => result.current.mutateAsync({ disciplineId: 4, name: 'Basics' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/disciplines/4/modules', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Basics' }),
    });
    await waitFor(() => expect(invalidatedLibrary(invalidate)).toBe(true));
  });

  it('renames and reorders through PATCH on the module', async () => {
    const { wrapper } = harness();
    const rename = renderHook(() => useRenameDisciplineModule(), { wrapper });
    await act(() => rename.result.current.mutateAsync({ moduleId: 7, name: 'Fundamentals' }));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/discipline-modules/7', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Fundamentals' }) }));
    const reorder = renderHook(() => useReorderDisciplineModule(), { wrapper });
    await act(() => reorder.result.current.mutateAsync({ moduleId: 7, prevModuleId: 6, nextModuleId: null }));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/discipline-modules/7', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ prevModuleId: 6, nextModuleId: null }) }));
  });

  it('deletes through DELETE on the module', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { wrapper } = harness();
    const { result } = renderHook(() => useDeleteDisciplineModule(), { wrapper });
    await act(() => result.current.mutateAsync({ moduleId: 7 }));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/discipline-modules/7', { method: 'DELETE' });
  });

  it('files a lesson through its library-placement route and refreshes the library even on failure (settled)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'This lesson is in Weather; that module is in Navigation. Lessons stay in their discipline — file it into one of Weather’s modules.' }), { status: 400 }));
    const { wrapper, invalidate } = harness();
    const { result } = renderHook(() => usePlaceLibraryLesson(), { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ lessonId: 10, disciplineModuleId: 7, prevLessonId: null, nextLessonId: 12 })),
    ).rejects.toThrow(/Lessons stay in their discipline/);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/lessons/10/library-placement', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disciplineModuleId: 7, prevLessonId: null, nextLessonId: 12 }),
    });
    await waitFor(() => expect(invalidatedLibrary(invalidate)).toBe(true));
  });

  it('turns a plain 403 into the discipline sentence', async () => {
    fetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const { wrapper } = harness();
    const { result } = renderHook(() => useCreateDisciplineModule(), { wrapper });
    await expect(act(() => result.current.mutateAsync({ disciplineId: 4, name: 'x' }))).rejects.toThrow(
      'Only an admin or one of this discipline’s subject experts can organise it.',
    );
  });
});
```

- [ ] **Step 2: Run red** — `pnpm vitest run src/data-hooks/__tests__/use-discipline-modules.test.tsx`.

- [ ] **Step 3: Write the hooks**

```ts
// src/data-hooks/use-discipline-modules.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { dataKeys } from './keys';

const FORBIDDEN = 'Only an admin or one of this discipline’s subject experts can organise it.';

/** The server's own sentence when it sent one; the discipline sentence for a bare 403; else a coded fallback. */
async function readError(res: Response, fallback: string): Promise<never> {
  let message = res.status === 403 ? FORBIDDEN : fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Non-JSON body (the plain "Forbidden") — keep the sentence above.
  }
  throw new Error(message);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Discipline modules are library furniture: every write here changes only
 * the org library query. Nothing invalidates a course board or a learner
 * payload, because nothing about a course changed.
 */
function useLibraryMutation<TVars>(
  request: (vars: TVars) => Promise<Response>,
  fallback: string,
  when: 'success' | 'settled',
) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const res = await request(vars);
      if (!res.ok) await readError(res, fallback);
    },
    // Drag commits refetch on SETTLED: after a failed move the optimistic
    // preview has been rolled back to a guess, and the refetch is the
    // truth — the same reasoning as `useMovePlacement`. Creates, renames and
    // deletes made no optimistic change, so success is enough.
    ...(when === 'settled' ? { onSettled: invalidate } : { onSuccess: invalidate }),
  });
}

export function useCreateDisciplineModule() {
  return useLibraryMutation(
    (vars: { disciplineId: number; name: string }) =>
      fetch(`/api/admin/disciplines/${vars.disciplineId}/modules`, json('POST', { name: vars.name })),
    'Could not create that module',
    'success',
  );
}

export function useRenameDisciplineModule() {
  return useLibraryMutation(
    (vars: { moduleId: number; name: string }) =>
      fetch(`/api/admin/discipline-modules/${vars.moduleId}`, json('PATCH', { name: vars.name })),
    'Could not rename that module',
    'success',
  );
}

export function useReorderDisciplineModule() {
  return useLibraryMutation(
    (vars: { moduleId: number; prevModuleId: number | null; nextModuleId: number | null }) =>
      fetch(`/api/admin/discipline-modules/${vars.moduleId}`, json('PATCH', { prevModuleId: vars.prevModuleId, nextModuleId: vars.nextModuleId })),
    'Could not reorder that module',
    'settled',
  );
}

export function useDeleteDisciplineModule() {
  return useLibraryMutation(
    (vars: { moduleId: number }) => fetch(`/api/admin/discipline-modules/${vars.moduleId}`, { method: 'DELETE' }),
    'Could not delete that module',
    'success',
  );
}

export function usePlaceLibraryLesson() {
  return useLibraryMutation(
    (vars: { lessonId: number; disciplineModuleId: number | null; prevLessonId: number | null; nextLessonId: number | null }) =>
      fetch(`/api/admin/lessons/${vars.lessonId}/library-placement`, json('PATCH', {
        disciplineModuleId: vars.disciplineModuleId, prevLessonId: vars.prevLessonId, nextLessonId: vars.nextLessonId,
      })),
    'Could not move that lesson',
    'settled',
  );
}
```

- [ ] **Step 4: Run green, commit** — `feat(hooks): discipline module mutations`

---

### Task 6: Drag ids, drop resolution, optimistic library updates

**Files:**
- Modify: `src/lib/dnd-ids.ts`
- Modify: `src/components/admin/resolve-drop.ts`
- Modify: `src/components/admin/editor-board-updates.ts`
- Test: `src/lib/__tests__/dnd-ids.test.ts`, `src/components/admin/__tests__/resolve-drop.test.ts`, `src/components/admin/__tests__/editor-board-updates.test.ts`

**Interfaces:**
- `dnd-ids.ts`: `libraryModuleDndId(id)`, `libraryContainerDndId(moduleId)`, `libraryUntitledDndId(disciplineId)` → `library-module-<id>`, `library-container-<id>`, `library-untitled-<disciplineId>`; `DndType` gains `'library-module' | 'library-container' | 'library-untitled'`; `parseDndId` returns them as flat kinds.
- `resolveDrop(board, activeId, overId, origin?, library?: OrgLibrary)` — `library` is required to resolve any library-side target; without it those resolve `null`. New `DropResolution` variants:
  ```ts
  | { kind: 'library-move'; lessonId: number; disciplineId: number; disciplineModuleId: number | null; overId: string | number }
  | { kind: 'reorder-library-module'; disciplineId: number; moduleId: number; overModuleId: number }
  ```
- `editor-board-updates.ts`:
  ```ts
  export function moveLessonInLibrary(library: OrgLibrary, lessonId: number, disciplineModuleId: number | null, overId: string | number): OrgLibrary
  export function reorderLibraryModules(library: OrgLibrary, disciplineId: number, moduleId: number, overModuleId: number): OrgLibrary
  export function libraryLessonNeighbours(library: OrgLibrary, lessonId: number): { prevLessonId: number | null; nextLessonId: number | null }
  export function libraryModuleNeighbours(library: OrgLibrary, disciplineId: number, moduleId: number): { prevModuleId: number | null; nextModuleId: number | null }
  ```

- [ ] **Step 1: Write the failing tests** — using the resolve-drop test file's fixture builders plus a `libraryFixture()` builder: two disciplines (Weather 4 with modules Basics 7 [lessons 1,2] and Advanced 8 [6], untitled [3]; Navigation 9 with module 20 [30]). Cases, each `it` named for the row of the spec's drag table:
  - library lesson 1 over `libraryContainerDndId(8)` → `library-move` `{ lessonId: 1, disciplineId: 4, disciplineModuleId: 8, overId }`
  - library lesson 1 over `libraryLessonDndId(2)` (same module) → `library-move` with `disciplineModuleId: 7` (a reorder)
  - library lesson 1 over `libraryUntitledDndId(4)` → `library-move` with `null`
  - library lesson 1 over `libraryModuleDndId(20)` (Navigation) → `forbidden`, reason `'"L1" is in Weather. Lessons stay in their discipline — file it into one of Weather’s modules, or drop it on a course module to teach it there.'`
  - library lesson 1 over a course container → `link` (unchanged; re-assert)
  - library module 7 over `libraryModuleDndId(8)` → `reorder-library-module` `{ disciplineId: 4, moduleId: 7, overModuleId: 8 }`
  - library module 7 over `libraryModuleDndId(20)` → `forbidden` (`'Modules stay in their discipline.'` sentence naming both)
  - library module 7 over a course module → `forbidden` (`'A discipline module organises the library; it cannot be added to a course. Drag its lessons into the course instead.'`)
  - `resolveDrop` without `library` and a library-side over id → `null`
  - `dnd-ids`: round trips for the three new kinds; `parseDndId('library-module-7')` → `{ type: 'library-module', id: 7 }`.
  - `editor-board-updates`: `moveLessonInLibrary` moves lesson 3 from Untitled into module 8 before lesson 6 (over `libraryLessonDndId(6)`) and updates its `disciplineModuleId`; over a container appends; `reorderLibraryModules` swaps within discipline 4 only; both neighbour helpers.

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement** — in `resolveDrop`, the `active.type === 'library-lesson'` branch gains, BEFORE the course-side checks: locate the lesson in `library` (via `disciplineLessons` per discipline, recording its discipline id); if `over.type` is `library-module` / `library-container` / `library-untitled` / `library-lesson`, resolve the target box (module id or null + its discipline id) and return `library-move` or the cross-discipline refusal. A new `active.type === 'library-module'` branch: over a library module of the same discipline → reorder; over another discipline's → forbidden; over anything on the rail → forbidden with the sentence above. The existing `over.type === 'library-lesson' → null` line is removed (library cards are now sortables, hence droppables). In `editor-board-updates.ts` the four functions are plain immutable array surgery on `OrgLibrary`, keyed on the library's own `disciplineModuleId`.

- [ ] **Step 4: Run all three test files + tsc, commit** — `feat(editor): resolve library drags — file, reorder, and refuse across disciplines`

---

### Task 7: The library column: modules, Untitled, add/rename/delete

**Files:**
- Modify: `src/atoms/admin.ts` — `expandedLibraryModuleIdsAtom: atom<number[]>([])`, `createDisciplineModuleTargetAtom: atom<{ disciplineId: number; disciplineName: string } | null>(null)`, `renameDisciplineModuleTargetAtom: atom<{ id: number; name: string } | null>(null)`, `deleteDisciplineModuleTargetAtom: atom<{ id: number; name: string; lessonCount: number } | null>(null)`
- Modify: `src/components/admin/discipline-column.tsx` — gains `expandedModuleIds` / `onExpandedModuleIdsChange` and wraps `children` in a controlled `Accordion.Root multiple` exactly as `CourseColumn` does
- Modify: `src/components/admin/discipline-column-container.tsx` — prop `lessons` becomes `discipline: LibraryDiscipline` (the org-level Untitled column keeps passing a synthetic `{ modules: [], untitled: lessons }`); renders one `LibraryModuleContainer` per module then `LibraryUntitledContainer`
- Create: `src/components/admin/library-module-container.tsx` — `useSortable({ id: libraryModuleDndId(mod.id), data: { type: 'library-module', moduleId: mod.id, disciplineId } })` + `useDroppable({ id: libraryContainerDndId(mod.id), data: { type: 'library-container', moduleId: mod.id, disciplineId } })`, renders `ModuleAccordionItem` with `onEditModule`/`onDeleteModule` setting the atoms, and a `SortableContext` of `LibraryLessonCardContainer`s
- Create: `src/components/admin/library-untitled-container.tsx` — a droppable (`libraryUntitledDndId(disciplineId)`) titled "Untitled" with its own `SortableContext`; no rename/delete/handle; empty reads "Every lesson is in a module"
- Modify: `src/components/admin/library-lesson-card-container.tsx` — `useSortable` instead of `useDraggable` (same id, data gains `disciplineModuleId`)
- Modify: `src/components/admin/discipline-column-actions.tsx` — `onAddModule` first in the bar (`Add a module to ${name}`)
- Create: `src/components/admin/create-discipline-module-dialog-container.tsx` (form: `CreateModuleForm` if it fits, else a name field), `rename-discipline-module-dialog-container.tsx` (reuse `RenameDisciplineForm`'s shape), `delete-discipline-module-dialog-container.tsx` + `delete-discipline-module-confirm.tsx` (light confirm like `NewsSourceDeleteConfirm`: "{n} lessons return to Untitled. Nothing is deleted.")
- Modify: `src/components/admin/editor-container.tsx` — mounts the three dialogs; passes `discipline` objects
- Test: `src/components/admin/__tests__/discipline-column.test.tsx` (extend), `library-untitled.test.tsx`, `delete-discipline-module-confirm.test.tsx`, `discipline-column-actions.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/admin/__tests__/library-untitled.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryUntitled } from '../library-untitled';

describe('LibraryUntitled', () => {
  it('is titled Untitled, holds what it is given, and offers no controls at all', () => {
    render(<LibraryUntitled lessonCount={2}><p>card a</p><p>card b</p></LibraryUntitled>);
    expect(screen.getByText('Untitled')).toBeTruthy();
    expect(screen.getByText('2 lessons')).toBeTruthy();
    expect(screen.getByText('card a')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('says every lesson is in a module when empty', () => {
    render(<LibraryUntitled lessonCount={0} />);
    expect(screen.getByText('Every lesson is in a module')).toBeTruthy();
  });
});
```

```tsx
// src/components/admin/__tests__/delete-discipline-module-confirm.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteDisciplineModuleConfirm } from '../delete-discipline-module-confirm';

describe('DeleteDisciplineModuleConfirm', () => {
  it('names how many lessons return to Untitled and that nothing is deleted', () => {
    const onConfirm = vi.fn();
    render(<DeleteDisciplineModuleConfirm moduleName="Basics" lessonCount={2} isPending={false} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByText(/2 lessons in Basics return to Untitled/)).toBeTruthy();
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete module' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it('uses the singular for one lesson', () => {
    render(<DeleteDisciplineModuleConfirm moduleName="Basics" lessonCount={1} isPending={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/1 lesson in Basics returns to Untitled/)).toBeTruthy();
  });
});
```

Extend `discipline-column-actions.test.tsx` (it stubs `TooltipIconButton` already):

```tsx
  it('offers to add a module, first in the bar, naming the discipline', () => {
    const onAddModule = vi.fn();
    renderActions({ onAddModule });
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-label')).toBe('Add a module to Weather');
    fireEvent.click(buttons[0]);
    expect(onAddModule).toHaveBeenCalledOnce();
  });
```

Extend `discipline-column.test.tsx`: given `children` and `expandedModuleIds`, the column wraps children in an accordion root (a `[data-accordion-root]` attribute or the Base UI root's presence — assert `screen.getByText('child')` renders and that `onExpandedModuleIdsChange` is a prop the test can pass without type error; keep this test light, the behaviour is Base UI's).

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Atoms**

In `src/atoms/admin.ts`, beside the discipline atoms:

```ts
/**
 * Open discipline-module accordions in the library pane — a sibling of
 * `expandedEditorModuleIdsAtom`, not the same list: discipline module ids
 * and course module ids come from different tables and would collide.
 */
export const expandedLibraryModuleIdsAtom = atom<number[]>([]);
/** The discipline getting a new module, or null. */
export const createDisciplineModuleTargetAtom = atom<{ disciplineId: number; disciplineName: string } | null>(null);
/** The discipline module being renamed, or null. */
export const renameDisciplineModuleTargetAtom = atom<{ id: number; name: string } | null>(null);
/** The discipline module pending deletion; `lessonCount` is what the confirm quotes. */
export const deleteDisciplineModuleTargetAtom = atom<{ id: number; name: string; lessonCount: number } | null>(null);
```

- [ ] **Step 4: Presentational pieces**

```tsx
// src/components/admin/library-untitled.tsx
import type { ReactNode } from 'react';

/**
 * A discipline's Untitled group: the lessons filed in no module, where
 * every lesson starts. Deliberately not a module — no rename, no delete,
 * no drag handle, always last — so the difference between "a box the SME
 * made" and "the shelf itself" is visible.
 */
export const LibraryUntitled = ({
  lessonCount,
  showHeading = true,
  children,
}: {
  lessonCount: number;
  /** False on the org-level Untitled column, whose header already says it. */
  showHeading?: boolean;
  children?: ReactNode;
}) => (
  <section className="flex flex-col">
    {showHeading && (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 font-medium text-secondary text-sm">Untitled</span>
        <span className="shrink-0 text-tertiary text-xs tabular-nums">
          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
        </span>
      </div>
    )}
    <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
      {lessonCount === 0 ? (
        <p className="px-1 py-3 text-center text-tertiary text-xs">Every lesson is in a module</p>
      ) : (
        children
      )}
    </div>
  </section>
);
```

```tsx
// src/components/admin/delete-discipline-module-confirm.tsx
import { Loader2, TriangleAlert } from 'lucide-react';

/** Light confirm (as `NewsSourceDeleteConfirm`): nothing here is destroyed. */
export const DeleteDisciplineModuleConfirm = ({
  moduleName, lessonCount, isPending, onConfirm, onCancel,
}: { moduleName: string; lessonCount: number; isPending: boolean; onConfirm: () => void; onCancel: () => void }) => (
  <div className="flex flex-col gap-4">
    <div className="flex items-start gap-2 rounded-lg border border-warning-7 bg-warning-3 px-3 py-2.5 text-sm text-warning-text">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>
          {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'} in {moduleName} {lessonCount === 1 ? 'returns' : 'return'} to Untitled.
        </strong>{' '}
        Nothing is deleted — only the box goes.
      </p>
    </div>
    <div className="flex items-center justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={isPending} className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60">Cancel</button>
      <button type="button" onClick={onConfirm} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-9 px-4 py-2.5 font-medium text-black text-sm transition-colors hover:bg-error-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Delete module
      </button>
    </div>
  </div>
);
```

`DisciplineColumn`: add `expandedModuleIds?: number[]`, `onExpandedModuleIdsChange?: (ids: number[]) => void`, and wrap `children` in `<Accordion.Root multiple value={expandedModuleIds} onValueChange={onExpandedModuleIdsChange} className="flex flex-col">` inside the existing ScrollArea (copy `CourseColumn`'s lines and its comment about why the state is lifted). `DisciplineColumnActions`: add `onAddModule: () => void` and render `<TooltipIconButton label={`Add a module to ${disciplineName}`} onClick={onAddModule}><FolderPlus …/></TooltipIconButton>` first.

- [ ] **Step 5: Containers**

```tsx
// src/components/admin/library-module-container.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { deleteDisciplineModuleTargetAtom, renameDisciplineModuleTargetAtom } from '#/atoms/admin';
import type { LibraryDisciplineModule } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { libraryContainerDndId, libraryLessonDndId, libraryModuleDndId } from '#/lib/dnd-ids';
import { LibraryLessonCardContainer } from './library-lesson-card-container';
import { ModuleAccordionItem } from './module-accordion-item';

/**
 * One discipline module in the library column: sortable among its
 * siblings (within the discipline only — `resolveDrop` refuses the rest)
 * and a drop target for library lessons. Same double registration on one
 * wrapper as `EditorModuleContainer`, for the same reason: a collapsed
 * panel has no size, so the whole item is the droppable.
 */
export const LibraryModuleContainer = ({
  module: mod,
  disciplineId,
}: {
  module: LibraryDisciplineModule;
  disciplineId: number;
}) => {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isSorting, isDragging } =
    useSortable({ id: libraryModuleDndId(mod.id), data: { type: 'library-module', moduleId: mod.id, disciplineId } });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: libraryContainerDndId(mod.id), data: { type: 'library-container', moduleId: mod.id, disciplineId },
  });
  const openRename = useSetAtom(renameDisciplineModuleTargetAtom);
  const openDelete = useSetAtom(deleteDisciplineModuleTargetAtom);

  return (
    <div
      ref={useCallback((node: HTMLDivElement | null) => { setSortableRef(node); setDroppableRef(node); }, [setSortableRef, setDroppableRef])}
      style={{ transform: CSS.Transform.toString(transform), transition: isSorting ? transition : undefined }}
      className={cn(isDragging && 'opacity-40', isOver && 'bg-gray-3')}
    >
      <ModuleAccordionItem
        module={mod}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEditModule={() => openRename({ id: mod.id, name: mod.name })}
        onDeleteModule={() => openDelete({ id: mod.id, name: mod.name, lessonCount: mod.lessons.length })}
        lessonsSlot={
          <SortableContext items={mod.lessons.map((l) => libraryLessonDndId(l.id))} strategy={verticalListSortingStrategy}>
            {mod.lessons.length === 0 ? (
              <p className="px-1 py-3 text-center text-tertiary text-xs">Drag lessons here</p>
            ) : (
              mod.lessons.map((lesson) => (
                <LibraryLessonCardContainer key={lesson.id} lesson={lesson} disciplineId={disciplineId} />
              ))
            )}
          </SortableContext>
        }
      />
    </div>
  );
};
```

```tsx
// src/components/admin/library-untitled-container.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { libraryLessonDndId, libraryUntitledDndId } from '#/lib/dnd-ids';
import { LibraryLessonCardContainer } from './library-lesson-card-container';
import { LibraryUntitled } from './library-untitled';

export const LibraryUntitledContainer = ({ disciplineId, lessons }: { disciplineId: number; lessons: LibraryLesson[] }) => {
  const { setNodeRef, isOver } = useDroppable({ id: libraryUntitledDndId(disciplineId), data: { type: 'library-untitled', disciplineId } });
  return (
    <div ref={setNodeRef} className={cn(isOver && 'bg-gray-3')}>
      <LibraryUntitled lessonCount={lessons.length}>
        <SortableContext items={lessons.map((l) => libraryLessonDndId(l.id))} strategy={verticalListSortingStrategy}>
          {lessons.map((lesson) => (
            <LibraryLessonCardContainer key={lesson.id} lesson={lesson} disciplineId={disciplineId} />
          ))}
        </SortableContext>
      </LibraryUntitled>
    </div>
  );
};
```

`LibraryLessonCardContainer`: replace `useDraggable` with `useSortable` (same id; `data` gains `disciplineModuleId: lesson.disciplineModuleId`; apply `transform`/`transition` via `CSS.Transform.toString` like `EditorLessonCardContainer`). `DisciplineColumnContainer`: prop `lessons: LibraryLesson[]` becomes `discipline: Pick<LibraryDiscipline, 'modules' | 'untitled'>`; it reads the expanded-ids atom (filter to own module ids, fold back, exactly as `EditorCourseColumnContainer` does), renders `discipline.modules.map(m => <LibraryModuleContainer …/>)` then `<LibraryUntitledContainer …/>`; `lessonCount` for the header is `disciplineLessons(discipline).length`; `onAddModule` sets `createDisciplineModuleTargetAtom`. The org-level Untitled column (`UNTITLED_DISCIPLINE_ID`) passes `{ modules: [], untitled: library.untitled }` and hides the Untitled heading (`showHeading={false}` on `LibraryUntitled`) since the whole column is untitled. Dialog containers mirror `create-library-lesson-dialog-container.tsx` / `rename-discipline-dialog-container.tsx` / `delete-discipline-dialog-container.tsx` with the new atoms and hooks; mount all three in `editor-container.tsx` beside the discipline dialogs.

- [ ] **Step 6: Run everything, commit** — `feat(library): discipline columns are accordions of modules with an Untitled group; add, rename, delete`

---

### Task 8: Editor wiring — drag the library

**Files:**
- Modify: `src/components/admin/editor-container.tsx` — `collisionDetection` admits the new kinds (a `library-lesson` drag: targets of type `library-module`/`library-container`/`library-untitled`/`library-lesson` of its OWN discipline join the candidate set beside the rail's; other disciplines' stay in so `resolveDrop` can refuse by name — the same reasoning as the existing `discipline` case); a `library-module` drag: only `library-module` targets. `onDragStart` snapshots the library query too; `onDragOver` previews `library-move` with `moveLessonInLibrary` (live transfer, like lessons on the rail) and `reorder-library-module`; `onDragEnd` commits via `usePlaceLibraryLesson` / `useReorderDisciplineModule` with `libraryLessonNeighbours` / `libraryModuleNeighbours`, rolling both snapshots back on error; `resolveDrop` calls pass `library`; `describeDndTarget` names library modules and Untitled; the `DragOverlay` renders a `ModuleAccordionItem` for an active library module.
- Test: `src/components/admin/__tests__/editor-board-updates.test.ts` already covers the pure parts; add `src/components/admin/__tests__/editor-library-drag.test.tsx` only if a pure seam can be extracted (e.g. a `commitLibraryDrop(resolution, library)` helper returning the mutation vars) — extract it, test it, and keep the container thin.

- [ ] **Step 1: Write the failing test for the pure commit seam**

```ts
// src/components/admin/__tests__/commit-library-drop.test.ts
import { describe, expect, it } from 'vitest';
import { commitLibraryDrop } from '../commit-library-drop';

const lesson = (id: number, disciplineModuleId: number | null) =>
  ({ id, name: `L${id}`, slug: `l${id}`, isConfigured: false, isAvailable: true, courseCount: 0, courseIds: [], videoProvider: null, disciplineModuleId, levels: [], requiredSubscriptions: [], hasDebrief: false, needsVideoWatch: false }) as const;

/** The library AFTER the optimistic preview has placed the lesson. */
const previewed = {
  untitled: [],
  disciplines: [{
    id: 4, name: 'Weather', slug: 'weather',
    modules: [{ id: 7, name: 'Basics', rank: 1, lessons: [lesson(2, 7), lesson(1, 7), lesson(5, 7)] }],
    untitled: [lesson(3, null)],
  }],
};

describe('commitLibraryDrop', () => {
  /**
   * The body the server receives names the lesson's NEW neighbours as the
   * preview shows them — that is what makes the persisted order match what
   * the admin watched happen. Mutant: neighbours read from the pre-drag
   * library, which would file the lesson where it started.
   */
  it('a library-move commits the module and the previewed neighbours', () => {
    expect(
      commitLibraryDrop({ kind: 'library-move', lessonId: 1, disciplineId: 4, disciplineModuleId: 7, overId: 'library-lesson-5' }, previewed),
    ).toEqual({ kind: 'place', vars: { lessonId: 1, disciplineModuleId: 7, prevLessonId: 2, nextLessonId: 5 } });
  });
  it('a reorder commits the module’s previewed neighbours', () => {
    const lib = { ...previewed, disciplines: [{ ...previewed.disciplines[0], modules: [
      { id: 8, name: 'Advanced', rank: 2, lessons: [] }, { id: 7, name: 'Basics', rank: 1, lessons: [] },
    ] }] };
    expect(commitLibraryDrop({ kind: 'reorder-library-module', disciplineId: 4, moduleId: 7, overModuleId: 8 }, lib))
      .toEqual({ kind: 'reorder', vars: { moduleId: 7, prevModuleId: 8, nextModuleId: null } });
  });
});
```

- [ ] **Step 2: Run red, then write the seam**

```ts
// src/components/admin/commit-library-drop.ts
import type { OrgLibrary } from '#/lib/admin-schemas';
import { libraryLessonNeighbours, libraryModuleNeighbours } from './editor-board-updates';
import type { DropResolution } from './resolve-drop';

export type LibraryCommit =
  | { kind: 'place'; vars: { lessonId: number; disciplineModuleId: number | null; prevLessonId: number | null; nextLessonId: number | null } }
  | { kind: 'reorder'; vars: { moduleId: number; prevModuleId: number | null; nextModuleId: number | null } };

/**
 * The mutation a library drop turns into, read off the PREVIEWED library
 * (after the optimistic update), so the neighbours sent to the server are
 * the ones the admin saw the lesson land between. Pure, so the container
 * stays a thin relay and this decision has a test.
 */
export function commitLibraryDrop(
  resolution: Extract<DropResolution, { kind: 'library-move' | 'reorder-library-module' }>,
  previewed: OrgLibrary,
): LibraryCommit {
  if (resolution.kind === 'library-move') {
    return {
      kind: 'place',
      vars: { lessonId: resolution.lessonId, disciplineModuleId: resolution.disciplineModuleId, ...libraryLessonNeighbours(previewed, resolution.lessonId) },
    };
  }
  return {
    kind: 'reorder',
    vars: { moduleId: resolution.moduleId, ...libraryModuleNeighbours(previewed, resolution.disciplineId, resolution.moduleId) },
  };
}
```

- [ ] **Step 3: Wire `editor-container.tsx`**

In order, each a small, local change:

1. `const libraryKey = dataKeys.orgLibrary()`; `librarySnapshotRef = useRef<OrgLibrary | null>(null)`; `readLibrary = () => queryClient.getQueryData<OrgLibrary>(libraryKey) ?? null`; `onDragStart` sets `librarySnapshotRef.current = readLibrary()`; `rollback` also restores the library snapshot when set.
2. `collisionDetection`: for `activeType === 'library-lesson'`, the candidate set is every container EXCEPT the `discipline` column the card came from (existing rule) — the new `library-*` kinds pass through the existing filter unchanged, since they are not `discipline`; for `activeType === 'library-module'`, candidates are only `library-module` containers (`closestCenter`), with the same miss gate as modules.
3. Every `resolveDrop(current, …)` call passes `library ?? undefined` as the fifth argument.
4. `onDragOver`: if `resolution?.kind === 'library-move'` and `library`, `queryClient.setQueryData(libraryKey, moveLessonInLibrary(library, resolution.lessonId, resolution.disciplineModuleId, over.id))`; if `reorder-library-module`, `reorderLibraryModules(...)`. Auto-expand: schedule for `library-move` targets whose module is collapsed, through `expandedLibraryModuleIdsAtom` (a second timer ref, or generalise the existing one with a `kind` field).
5. `onDragEnd`: for the two library kinds, `const commit = commitLibraryDrop(resolution, readLibrary())`, then `placeLibraryLesson.mutate(commit.vars, { onError })` or `reorderDisciplineModule.mutate(...)`, with `onError` rolling back and toasting.
6. `describeDndTarget`: a `library-module`/`library-container` id → `'${moduleName} in ${disciplineName}'`; `library-untitled` → `'Untitled in ${disciplineName}'`. Announcements for `library-move` read `Will file in …`.
7. `DragOverlay`: `activeLibraryModule` (found by id across `library.disciplines[].modules`) renders `<ModuleAccordionItem module={…} lessonsSlot={null} />`; the `activeDragLibraryModuleIdAtom` is a new atom beside `activeDragLibraryLessonIdAtom`.

- [ ] **Step 4: Full suite, tsc, biome; commit** — `feat(editor): drag lessons between a discipline's modules and Untitled, and reorder the modules`

---

### Task 9: Walk it in the browser

On `localhost:5001` as admin, in the knowledge editor:

1. Every discipline column shows its existing lessons under **Untitled**; nothing is missing (compare counts with the column header's lesson count).
2. **Add a module** on a discipline → a "Basics" accordion appears above Untitled, empty.
3. Drag a lesson from Untitled into Basics; reload — it stays. Drag it above/below another; order holds.
4. Drag a Basics lesson onto another discipline's module → refusal toast naming both disciplines; nothing moves.
5. Drag a Basics lesson onto a course module on the rail → linked into the course, still in Basics (the library is untouched).
6. Rename Basics; delete it → confirm says "2 lessons return to Untitled. Nothing is deleted."; they do.
7. Add two modules; drag one above the other; reload — order holds.
8. As a learner, open a course that teaches one of those lessons: nothing changed.

---

## Done when

- `discipline_modules` exists in `information_schema` with CASCADE from disciplines; `lessons.discipline_module_id` is nullable with SET NULL; `lessons.library_rank` nullable; no lesson row was changed by the migration.
- `grep -rn "discipline.lessons\|d\.lessons" src --include='*.ts' --include='*.tsx'` finds no reader of a flat discipline lesson list — `disciplineLessons()` is the one definition.
- Every route test pins the discipline id its guard received.
- The Task 9 walkthrough passes end to end.
