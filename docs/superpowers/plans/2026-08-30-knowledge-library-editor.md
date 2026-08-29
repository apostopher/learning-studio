# Knowledge Library Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-course horizontal module board with an org-level editor at `/admin/editor` — every org lesson on the left in discipline columns, a rail of course columns on the right stacking modules as accordions — where dragging a lesson *links* it, so one lesson row can sit in many courses.

**Architecture:** Expand / migrate / contract. Tasks 1–6 add `module_lessons` alongside the existing `lessons.module_id` and move every reader onto it while the app keeps working; Task 7 drops the old columns only once nothing reads them. Tasks 8–14 build the UI on the new read model.

**Tech Stack:** TanStack Start + TanStack Router, TanStack Query, Drizzle ORM + PostgreSQL, Jotai, Base UI (`@base-ui/react` 1.4.1), dnd-kit, Tailwind, Zod, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-30-knowledge-library-editor-design.md`

## Global Constraints

- **Never run `pnpm db:push` or `drizzle-kit generate`.** `drizzle/` lags `schema.ts` by many columns and `db:push` proposes truncating `docs` (6917 embedding rows) from unrelated drift. Every schema change ships as a hand-written idempotent script under `src/db/migrate-*.ts`, run via a `package.json` script, following `src/db/migrate-staff-roles.ts`.
- **Vitest cannot resolve the `@/` alias.** Any module imported directly by a test must import with `#/`. Application modules not under test may keep `@/`.
- **Test mocking pattern:** fully stub `#/db` and `#/db/schema` with `vi.hoisted` + `vi.mock`. Never `importOriginal` internal modules. Declare stub tables with real `pgTable` columns so `eq()` builds real fragments. See `src/db/__tests__/lesson-access-course-id.test.ts`.
- **Every regression test must be seen red before the fix.** `git stash`, run, confirm failure, `git stash pop`. A test that never went red is not a regression test.
- **Assert on what the consumer received**, never that a value exists in state. Capture the collaborator (`vi.fn()` stub, injected mutation) and assert on its arguments.
- **Presentational components must be hookless.** The react-compiler + vitest combination nulls the React dispatcher in component render tests. No `useState`, no `useEffect`, no custom hooks in `*.tsx` files that are not `*-container.tsx`. There is no `jest-dom`.
- **State:** Jotai for client state, TanStack Query for server state. Never `useState`/`useReducer` for shared state, never `useEffect` for fetching.
- **CSS:** logical properties only (`ms-*`, `pe-*`, `start-*`, `border-s`, `text-start`). Convert any physical property you touch.
- **Colours:** semantic tokens only (`text-primary`, `bg-gray-2`, `border-gray-6`, `text-error-text`). Never hardcoded hex or Tailwind palette classes. `apple-9` (navy) and `accent-9` (gold) are distinct hues — never mix them in one component.
- **Every admin server function self-guards** with `requireAdmin` or `requireCoursePermission`. All client reads go through TanStack Query data-hooks in `src/data-hooks/`.
- **Filenames kebab-case**, component exports PascalCase.
- Run `pnpm check` (Biome) before every commit. Run `pnpm test` before every commit.

---

## Decision recorded during planning

**Editing a lesson becomes an org-level permission, not a course-scoped one.**

`getCourseIdForLessonId` currently guards every lesson mutation by resolving the lesson's single course. Once a lesson is placed in three courses that function has no single answer, and "any course you staff" would let a Subject Expert on the Mini rewrite content delivered by the Full.

Since `lessons.orgId` makes lessons org-owned, the guard follows ownership:

| action | scope | guard |
| --- | --- | --- |
| edit lesson content, gates, video, discipline | **org** | `requireAdmin` |
| add / remove / reorder a **placement** | **course** | `requireCoursePermission(courseId, 'structure', …)` |

So an SME staffed on a course can compose that course freely from the library, but changing what a lesson *is* requires org authority. Task 6 implements this.

---

## File structure

**Created**

| file | responsibility |
| --- | --- |
| `src/db/migrate-lesson-placements.ts` | idempotent expand migration (Task 1) |
| `src/db/migrate-drop-lesson-module-id.ts` | idempotent contract migration (Task 7) |
| `src/db/placements.ts` | all `module_lessons` reads/writes |
| `src/db/editor.ts` | org-level editor board + library queries |
| `src/routes/api/admin/library.ts` | GET org library |
| `src/routes/api/admin/editor.ts` | GET org editor board |
| `src/routes/api/admin/modules.$moduleId.lessons.$lessonId.ts` | PATCH / DELETE a placement |
| `src/routes/_authed/admin.editor.tsx` | the new route |
| `src/data-hooks/use-library.ts` | library query hook |
| `src/data-hooks/use-editor-board.ts` | editor board query hook |
| `src/data-hooks/use-link-lesson.ts` | create a placement |
| `src/data-hooks/use-unlink-lesson.ts` | delete a placement |
| `src/components/admin/lesson-library.tsx` | left pane shell |
| `src/components/admin/discipline-column.tsx` | one discipline column |
| `src/components/admin/library-lesson-card.tsx` | draggable library card |
| `src/components/admin/course-rail.tsx` | right pane shell |
| `src/components/admin/course-column.tsx` | one course, Accordion root |
| `src/components/admin/module-accordion-item.tsx` | module trigger + panel |
| `src/components/admin/editor-pane-splitter.tsx` | draggable divider |
| `src/components/admin/editor-container.tsx` | the single DndContext |
| `src/components/admin/library-lesson-container.tsx` | sortable wrapper for a library card |

**Modified**

| file | change |
| --- | --- |
| `src/db/schema.ts` | `moduleLessonsTable`, `lessons.orgId`; later drop `moduleId`/`rank`, `lessonDependenciesTable` |
| `src/lib/admin-schemas.ts` | library + editor board Zod schemas |
| `src/db/admin.ts` | `getCourseBoard`, `moveLesson`, `createLesson`, `deleteLesson` onto placements |
| `src/db/library.ts` | `getLibraryForCourse` joins through placements |
| `src/db/course.ts`, `src/db/course-content.ts`, `src/db/course-progress.ts`, `src/db/lesson-access.ts`, `src/db/lesson-playback.ts`, `src/db/course-last-viewed.ts` | read `module_lessons` |
| `src/lib/dnd-ids.ts` | `library-lesson` type + last-hyphen parsing |
| `src/data-hooks/keys.ts` | `library()`, `editorBoard()` keys |
| `src/routes/_authed/admin.$courseId.editor.tsx` | redirect to `/admin/editor` |
| `package.json` | two `db:migrate-*` scripts |

**Deleted at the end of Task 14**

`src/components/admin/module-board-container.tsx`, `src/components/admin/module-column.tsx`, `src/components/admin/sortable-module-column.tsx`, `src/components/admin/course-board.tsx`, `src/components/admin/course-board-container.tsx`.

---

## Task 1: `module_lessons` table and `lessons.org_id`

Adds the new structures and backfills them. Nothing reads them yet, so the app is unchanged and fully working at the end of this task.

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrate-lesson-placements.ts`
- Modify: `package.json` (scripts)
- Test: `src/db/__tests__/lesson-placements-migration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `moduleLessonsTable` with columns `id, moduleId, lessonId, rank, dependsOn, createdAt, updatedAt`; `dbModuleLessonSchema`; `DBModuleLesson`. `lessonsTable.orgId: integer | null` (nullable in this task; `NOT NULL` is set by the migration once backfilled).

- [ ] **Step 1: Add the table and column to `src/db/schema.ts`**

Insert directly after `lessonsTableRelations`:

```ts
/**
 * Where a lesson sits inside a module — the join that lets ONE lesson row be
 * taught by many courses.
 *
 * `rank` and `dependsOn` live here rather than on the lesson because both are
 * properties of the placement: a lesson is third in the 2-Week and eighth in
 * the 16-Week, and its prerequisites can only name lessons the *containing*
 * course actually holds. The gates (`levels`, `requiredSubscriptions`,
 * `hasDebrief`, `needsVideoWatch`, `isAvailable`) deliberately stay on the
 * lesson — see the design doc's "Deferred" section.
 */
export const moduleLessonsTable = pgTable(
  'module_lessons',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    moduleId: integer('module_id')
      .notNull()
      .references(() => modulesTable.id, { onDelete: 'cascade' }),
    lessonId: integer('lesson_id')
      .notNull()
      .references(() => lessonsTable.id, { onDelete: 'cascade' }),
    rank: numeric('rank', { precision: 30, scale: 15 }).notNull(),
    /**
     * Explicit prerequisites for this lesson IN THIS COURSE. Moved off
     * `lesson_dependencies`, whose `lesson_id` was `.unique()` — one global
     * list per lesson cannot survive a lesson being taught by two courses.
     */
    dependsOn: jsonb('depends_on')
      .$type<z.infer<typeof CourseLessonDependenciesSchema>>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('module_lessons_module_lesson_idx').on(
      table.moduleId,
      table.lessonId,
    ),
    index('module_lessons_module_id_idx').on(table.moduleId),
    index('module_lessons_lesson_id_idx').on(table.lessonId),
  ],
);

export const dbModuleLessonSchema = createSelectSchema(moduleLessonsTable);
export type DBModuleLesson = z.infer<typeof dbModuleLessonSchema>;

export const moduleLessonsTableRelations = relations(
  moduleLessonsTable,
  ({ one }) => ({
    module: one(modulesTable, {
      fields: [moduleLessonsTable.moduleId],
      references: [modulesTable.id],
    }),
    lesson: one(lessonsTable, {
      fields: [moduleLessonsTable.lessonId],
      references: [lessonsTable.id],
    }),
  }),
);
```

In `lessonsTable`, add beside `disciplineId` (keep `moduleId` and `rank` for now — they are dropped in Task 7):

```ts
  /**
   * The org that owns this lesson. Lessons are org-level library items now,
   * so an UNPLACED lesson — new, or removed from every course — still has a
   * home and still appears in the library.
   *
   * One owner, deliberately. `course_orgs` allows a course to belong to
   * several orgs, so the backfill takes the lowest. If genuine cross-org
   * sharing arrives it becomes a join table, not a rework of this column.
   */
  orgId: integer('org_id').references(() => orgsTable.id, {
    onDelete: 'cascade',
  }),
```

Add to `modulesTableRelations` and `lessonsTableRelations` respectively:

```ts
    placements: many(moduleLessonsTable),
```

- [ ] **Step 2: Write the failing migration test**

Create `src/db/__tests__/lesson-placements-migration.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue([]) }));
vi.mock('#/db', () => ({ db }));

const { migrateLessonPlacements } = await import(
  '#/db/migrate-lesson-placements'
);

/** Flatten every executed statement into one lowercase string per call. */
function statements(): string[] {
  return db.execute.mock.calls.map((c) =>
    String((c[0] as { queryChunks?: unknown[] }).queryChunks?.join(' ') ?? c[0])
      .toLowerCase()
      .replace(/\s+/g, ' '),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('migrateLessonPlacements', () => {
  it('creates module_lessons before backfilling it', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    const create = all.indexOf('create table if not exists "module_lessons"');
    const insert = all.indexOf('insert into "module_lessons"');
    expect(create).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(create);
  });

  it('backfills exactly one placement per existing lesson, carrying rank', async () => {
    await migrateLessonPlacements();
    const insert = statements().find((s) =>
      s.includes('insert into "module_lessons"'),
    );
    expect(insert).toContain('select "module_id", "id", "rank" from "lessons"');
    // Idempotent: re-running must not double-insert.
    expect(insert).toContain('on conflict');
  });

  it('carries dependsOn across from lesson_dependencies', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    expect(all).toContain('from "lesson_dependencies"');
    expect(all).toContain('"depends_on"');
  });

  it('refuses to set org_id NOT NULL while any lesson lacks an org', async () => {
    await migrateLessonPlacements();
    const all = statements().join('\n');
    const guard = all.indexOf('where "org_id" is null');
    const notNull = all.indexOf('set not null');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(notNull).toBeGreaterThan(guard);
  });

  it('does not drop lessons.module_id — that is the contract migration', async () => {
    await migrateLessonPlacements();
    expect(statements().join('\n')).not.toContain('drop column "module_id"');
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/lesson-placements-migration.test.ts`
Expected: FAIL — cannot resolve `#/db/migrate-lesson-placements`.

- [ ] **Step 4: Write the migration**

Create `src/db/migrate-lesson-placements.ts`:

```ts
/**
 * Expand migration: introduce `module_lessons` and `lessons.org_id`.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole schema
 * and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * This migration ONLY expands. `lessons.module_id`, `lessons.rank` and
 * `lesson_dependencies` are still present and still authoritative afterwards —
 * `migrate-drop-lesson-module-id.ts` removes them once every reader has moved.
 *
 * Run: pnpm db:migrate-lesson-placements
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

export async function migrateLessonPlacements(): Promise<void> {
  console.info('Creating module_lessons…');
  await db.execute(sql`
    create table if not exists "module_lessons" (
      "id"         integer primary key generated always as identity,
      "module_id"  integer not null references "modules"("id") on delete cascade,
      "lesson_id"  integer not null references "lessons"("id") on delete cascade,
      "rank"       numeric(30,15) not null,
      "depends_on" jsonb not null default '[]'::jsonb,
      "created_at" timestamp not null default now(),
      "updated_at" timestamp not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists "module_lessons_module_lesson_idx"
      on "module_lessons" ("module_id", "lesson_id");
  `);
  await db.execute(sql`
    create index if not exists "module_lessons_module_id_idx"
      on "module_lessons" ("module_id");
  `);
  await db.execute(sql`
    create index if not exists "module_lessons_lesson_id_idx"
      on "module_lessons" ("lesson_id");
  `);

  console.info('Backfilling one placement per existing lesson…');
  await db.execute(sql`
    insert into "module_lessons" ("module_id", "lesson_id", "rank")
    select "module_id", "id", "rank" from "lessons"
    on conflict ("module_id", "lesson_id") do nothing;
  `);

  console.info('Carrying lesson_dependencies across…');
  await db.execute(sql`
    update "module_lessons" ml
    set "depends_on" = ld."depends_on"
    from "lesson_dependencies" ld
    where ld."lesson_id" = ml."lesson_id"
      and ml."depends_on" = '[]'::jsonb;
  `);

  console.info('Adding lessons.org_id…');
  await db.execute(sql`
    alter table "lessons"
      add column if not exists "org_id" integer references "organizations"("id") on delete cascade;
  `);

  console.info('Backfilling lessons.org_id via module → course → course_orgs…');
  await db.execute(sql`
    update "lessons" l
    set "org_id" = sub."org_id"
    from (
      select m."id" as "module_id", min(co."org_id") as "org_id"
      from "modules" m
      join "course_orgs" co on co."course_id" = m."course_id"
      group by m."id"
    ) sub
    where sub."module_id" = l."module_id"
      and l."org_id" is null;
  `);

  // The gate. A lesson with no org would have to be invented, so stop instead.
  const orphans = await db.execute(sql`
    select count(*)::int as "n" from "lessons" where "org_id" is null;
  `);
  const n = Number(
    (orphans as unknown as Array<{ n: number }>)[0]?.n ?? 0,
  );
  if (n > 0) {
    throw new Error(
      `${n} lesson(s) have no org — their course has no course_orgs row. ` +
        `Seed those links (pnpm db:seed-org-links) and re-run. ` +
        `Refusing to set org_id NOT NULL.`,
    );
  }

  console.info('Setting lessons.org_id NOT NULL…');
  await db.execute(sql`
    alter table "lessons" alter column "org_id" set not null;
  `);
  await db.execute(sql`
    create index if not exists "lessons_org_id_idx" on "lessons" ("org_id");
  `);
  await db.execute(sql`
    create index if not exists "lessons_discipline_id_idx"
      on "lessons" ("discipline_id");
  `);

  console.info('Done.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateLessonPlacements()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
```

- [ ] **Step 5: Add the package script**

In `package.json` `scripts`, after `db:migrate-staff-roles`:

```json
    "db:migrate-lesson-placements": "dotenv -e .env.local -- tsx src/db/migrate-lesson-placements.ts",
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm vitest run src/db/__tests__/lesson-placements-migration.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Run the migration against the real database**

Run: `pnpm db:migrate-lesson-placements`
Expected: the five `console.info` lines, then `Done.` If it throws about orphan lessons, run `pnpm db:seed-org-links` first, then re-run.

Verify by hand:

```sql
select count(*) from lessons;          -- N
select count(*) from module_lessons;   -- must equal N
select count(*) from lessons where org_id is null;  -- must be 0
```

- [ ] **Step 8: Verify the app still works**

Run: `pnpm test` then `pnpm dev` and open `/admin`. Nothing reads `module_lessons` yet, so the board must behave exactly as before.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/migrate-lesson-placements.ts \
        src/db/__tests__/lesson-placements-migration.test.ts package.json
git commit -m "feat(db): add module_lessons placements and lessons.org_id

Expand step only. lessons.module_id and lesson_dependencies stay
authoritative until every reader has moved across."
```

---

## Task 2: Placement read layer

A single module owning every `module_lessons` read, so later tasks have one seam to point at.

**Files:**
- Create: `src/db/placements.ts`
- Test: `src/db/__tests__/placements.test.ts`

**Interfaces:**
- Consumes: `moduleLessonsTable` (Task 1).
- Produces:
  - `getPlacementsForCourse(courseId: number): Promise<Placement[]>`
  - `getCourseIdsForLesson(lessonId: number): Promise<number[]>`
  - `getCourseCountsForLessons(lessonIds: number[]): Promise<Map<number, number>>`
  - `type Placement = { id: number; moduleId: number; lessonId: number; rank: number; dependsOn: CourseLessonDependency[] }`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/placements.test.ts`:

```ts
// @vitest-environment node
import { integer, jsonb, numeric, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
  dependsOn: jsonb('depends_on'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
});

function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(result),
    orderBy: () => Promise.resolve(result),
    then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
  };
  return chain;
}

const db = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ moduleLessonsTable, modulesTable }));

const {
  getPlacementsForCourse,
  getCourseIdsForLesson,
  getCourseCountsForLessons,
} = await import('#/db/placements');

beforeEach(() => vi.clearAllMocks());

describe('getPlacementsForCourse', () => {
  it('returns placements with rank coerced to a number', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        { id: 1, moduleId: 4, lessonId: 9, rank: '2.500', dependsOn: [] },
      ]),
    );

    const rows = await getPlacementsForCourse(3);

    expect(rows).toEqual([
      { id: 1, moduleId: 4, lessonId: 9, rank: 2.5, dependsOn: [] },
    ]);
  });

  it('returns an empty array for a course with no placements', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    expect(await getPlacementsForCourse(3)).toEqual([]);
  });
});

describe('getCourseIdsForLesson', () => {
  it('returns every course teaching the lesson, deduplicated', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ courseId: 1 }, { courseId: 5 }, { courseId: 1 }]),
    );
    expect(await getCourseIdsForLesson(9)).toEqual([1, 5]);
  });

  it('returns an empty array for an unplaced lesson', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    expect(await getCourseIdsForLesson(9)).toEqual([]);
  });
});

describe('getCourseCountsForLessons', () => {
  it('maps each lesson id to how many distinct courses teach it', async () => {
    db.select.mockReturnValueOnce(
      makeChain([
        { lessonId: 9, n: 2 },
        { lessonId: 10, n: 1 },
      ]),
    );

    const counts = await getCourseCountsForLessons([9, 10]);

    expect(counts.get(9)).toBe(2);
    expect(counts.get(10)).toBe(1);
  });

  it('short-circuits on an empty id list without querying', async () => {
    expect((await getCourseCountsForLessons([])).size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/placements.test.ts`
Expected: FAIL — cannot resolve `#/db/placements`.

- [ ] **Step 3: Write the implementation**

Create `src/db/placements.ts`:

```ts
import { countDistinct, eq, inArray } from 'drizzle-orm';
import { db } from '#/db';
import { moduleLessonsTable, modulesTable } from '#/db/schema';
import type { CourseLessonDependency } from '#/lib/admin-schemas';

/** One lesson's position inside one module. */
export type Placement = {
  id: number;
  moduleId: number;
  lessonId: number;
  rank: number;
  dependsOn: CourseLessonDependency[];
};

/** Every placement in a course, across all its modules, in rank order. */
export async function getPlacementsForCourse(
  courseId: number,
): Promise<Placement[]> {
  const rows = await db
    .select({
      id: moduleLessonsTable.id,
      moduleId: moduleLessonsTable.moduleId,
      lessonId: moduleLessonsTable.lessonId,
      rank: moduleLessonsTable.rank,
      dependsOn: moduleLessonsTable.dependsOn,
    })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
    .where(eq(modulesTable.courseId, courseId))
    .orderBy(moduleLessonsTable.rank);

  return rows.map((r) => ({
    id: r.id,
    moduleId: r.moduleId,
    lessonId: r.lessonId,
    // `numeric` arrives as a string from pg; every consumer sorts on it.
    rank: Number(r.rank),
    dependsOn: (r.dependsOn ?? []) as CourseLessonDependency[],
  }));
}

/**
 * Every course teaching a lesson.
 *
 * Replaces the single-course answer `getCourseIdForLessonId` used to give.
 * Callers that guard a mutation must decide what several courses means — see
 * the plan's "Editing a lesson becomes an org-level permission".
 */
export async function getCourseIdsForLesson(
  lessonId: number,
): Promise<number[]> {
  const rows = await db
    .select({ courseId: modulesTable.courseId })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
    .where(eq(moduleLessonsTable.lessonId, lessonId));

  return [...new Set(rows.map((r) => r.courseId))];
}

/**
 * How many distinct courses teach each of these lessons — the library card's
 * "in N courses" badge.
 */
export async function getCourseCountsForLessons(
  lessonIds: number[],
): Promise<Map<number, number>> {
  if (lessonIds.length === 0) return new Map();

  const rows = await db
    .select({
      lessonId: moduleLessonsTable.lessonId,
      n: countDistinct(modulesTable.courseId),
    })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
    .where(inArray(moduleLessonsTable.lessonId, lessonIds))
    .groupBy(moduleLessonsTable.lessonId);

  return new Map(rows.map((r) => [r.lessonId, Number(r.n)]));
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/db/__tests__/placements.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/placements.ts src/db/__tests__/placements.test.ts
git commit -m "feat(db): placement read layer over module_lessons"
```

---

## Task 3: Placement write layer

`linkLesson`, `unlinkLesson` and a placement-based `movePlacement`, including the course-level uniqueness rule.

**Files:**
- Modify: `src/db/placements.ts`
- Test: `src/db/__tests__/placement-writes.test.ts`

**Interfaces:**
- Consumes: `Placement`, `getCourseIdsForLesson` (Task 2).
- Produces:
  - `linkLesson(input: { moduleId: number; lessonId: number; prevLessonId: number | null; nextLessonId: number | null }): Promise<Placement | 'duplicate'>`
  - `unlinkLesson(moduleId: number, lessonId: number): Promise<boolean>`
  - `movePlacement(input: { lessonId: number; targetModuleId: number; prevLessonId: number | null; nextLessonId: number | null }): Promise<Placement | null>`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/placement-writes.test.ts`:

```ts
// @vitest-environment node
import { integer, jsonb, numeric, pgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleLessonsTable = pgTable('module_lessons', {
  id: integer('id').primaryKey(),
  moduleId: integer('module_id'),
  lessonId: integer('lesson_id'),
  rank: numeric('rank'),
  dependsOn: jsonb('depends_on'),
});
const modulesTable = pgTable('modules', {
  id: integer('id').primaryKey(),
  courseId: integer('course_id'),
});

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const invalidateCourseDetailsCache = vi.hoisted(() => vi.fn());
const getCourseSlugForModuleId = vi.hoisted(() =>
  vi.fn().mockResolvedValue('a-course'),
);
const getCourseIdForModuleId = vi.hoisted(() => vi.fn().mockResolvedValue(3));

vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', () => ({ moduleLessonsTable, modulesTable }));
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForModuleId,
  getCourseIdForModuleId,
}));

function selectChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(result),
    groupBy: () => Promise.resolve(result),
    then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
  };
  return chain;
}

const { linkLesson, unlinkLesson, movePlacement } = await import(
  '#/db/placements'
);

beforeEach(() => {
  vi.clearAllMocks();
  getCourseSlugForModuleId.mockResolvedValue('a-course');
  getCourseIdForModuleId.mockResolvedValue(3);
});

describe('linkLesson', () => {
  it('refuses a second placement in a course that already teaches the lesson', async () => {
    // The lesson is already in course 3; the target module is also course 3.
    db.select.mockReturnValueOnce(selectChain([{ courseId: 3 }]));

    const result = await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toBe('duplicate');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('inserts a placement when the course does not yet teach the lesson', async () => {
    db.select.mockReturnValueOnce(selectChain([{ courseId: 7 }]));
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 40, lessonId: 9, rank: '1', dependsOn: [] },
      ]);
    db.insert.mockReturnValue({ values: () => ({ returning }) });

    const result = await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(result).toEqual({
      id: 1,
      moduleId: 40,
      lessonId: 9,
      rank: 1,
      dependsOn: [],
    });
  });

  it('invalidates the target course cache so learners see the new lesson', async () => {
    db.select.mockReturnValueOnce(selectChain([]));
    db.insert.mockReturnValue({
      values: () => ({
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: 1, moduleId: 40, lessonId: 9, rank: '1', dependsOn: [] },
          ]),
      }),
    });

    await linkLesson({
      moduleId: 40,
      lessonId: 9,
      prevLessonId: null,
      nextLessonId: null,
    });

    expect(invalidateCourseDetailsCache).toHaveBeenCalledWith('a-course');
  });
});

describe('unlinkLesson', () => {
  it('reports false when no placement matched', async () => {
    db.delete.mockReturnValue({
      where: () => ({ returning: vi.fn().mockResolvedValue([]) }),
    });
    expect(await unlinkLesson(40, 9)).toBe(false);
  });

  it('reports true and invalidates the course cache when one was removed', async () => {
    db.delete.mockReturnValue({
      where: () => ({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) }),
    });

    expect(await unlinkLesson(40, 9)).toBe(true);
    expect(invalidateCourseDetailsCache).toHaveBeenCalledWith('a-course');
  });
});

describe('movePlacement', () => {
  it('updates the placement rather than the lesson', async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([
        { id: 1, moduleId: 41, lessonId: 9, rank: '1.5', dependsOn: [] },
      ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    db.update.mockReturnValue({ set });

    const result = await movePlacement({
      lessonId: 9,
      targetModuleId: 41,
      prevLessonId: 3,
      nextLessonId: 4,
    });

    // The consumer is the UPDATE: it must target module_lessons, and must
    // carry the new module id.
    expect(db.update).toHaveBeenCalledWith(moduleLessonsTable);
    expect(set.mock.calls[0][0]).toMatchObject({ moduleId: 41 });
    expect(result).toMatchObject({ moduleId: 41, rank: 1.5 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/placement-writes.test.ts`
Expected: FAIL — `linkLesson is not a function`.

- [ ] **Step 3: Append the implementation to `src/db/placements.ts`**

```ts
import { and, type SQL, sql } from 'drizzle-orm';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import {
  getCourseIdForModuleId,
  getCourseSlugForModuleId,
} from '#/db/lesson-access';

/**
 * Midpoint rank between two neighbours, matching `reorderModule`'s scheme:
 * halve to go first, +1 to go last, 1 into an empty module. Computed in SQL so
 * Postgres `numeric` does the arithmetic and no precision is lost in JS.
 */
function rankBetween(
  prevLessonId: number | null,
  nextLessonId: number | null,
  moduleId: number,
): SQL {
  const rankOf = (lessonId: number) =>
    sql`(select ${moduleLessonsTable.rank} from ${moduleLessonsTable}
         where ${moduleLessonsTable.lessonId} = ${lessonId}
           and ${moduleLessonsTable.moduleId} = ${moduleId})`;

  const prev = prevLessonId ? rankOf(prevLessonId) : null;
  const next = nextLessonId ? rankOf(nextLessonId) : null;

  if (prev && next) return sql`(${prev} + ${next}) / 2`;
  if (next) return sql`${next} / 2`;
  if (prev) return sql`${prev} + 1`;
  return sql`1`;
}

function toPlacement(row: {
  id: number;
  moduleId: number;
  lessonId: number;
  rank: unknown;
  dependsOn: unknown;
}): Placement {
  return {
    id: row.id,
    moduleId: row.moduleId,
    lessonId: row.lessonId,
    rank: Number(row.rank),
    dependsOn: (row.dependsOn ?? []) as CourseLessonDependency[],
  };
}

/**
 * Place an existing library lesson into a module.
 *
 * Returns `'duplicate'` rather than throwing when the target course already
 * teaches this lesson: one placement per course keeps completion unambiguous,
 * and the caller turns this into an explanation rather than an error.
 *
 * The unique index only covers (module_id, lesson_id), so the course-level rule
 * is checked here. A denormalised course_id on module_lessons would make it a
 * DB guarantee; not worth it until this check proves insufficient.
 */
export async function linkLesson(input: {
  moduleId: number;
  lessonId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<Placement | 'duplicate'> {
  const targetCourseId = await getCourseIdForModuleId(input.moduleId);
  if (targetCourseId === null) return 'duplicate';

  const existing = await getCourseIdsForLesson(input.lessonId);
  if (existing.includes(targetCourseId)) return 'duplicate';

  const [created] = await db
    .insert(moduleLessonsTable)
    .values({
      moduleId: input.moduleId,
      lessonId: input.lessonId,
      rank: rankBetween(
        input.prevLessonId,
        input.nextLessonId,
        input.moduleId,
      ),
      dependsOn: [],
    })
    .returning({
      id: moduleLessonsTable.id,
      moduleId: moduleLessonsTable.moduleId,
      lessonId: moduleLessonsTable.lessonId,
      rank: moduleLessonsTable.rank,
      dependsOn: moduleLessonsTable.dependsOn,
    });

  await invalidateCourseDetailsCache(
    await getCourseSlugForModuleId(input.moduleId),
  );

  return toPlacement(created);
}

/** Remove a placement. The lesson itself survives, in the library and elsewhere. */
export async function unlinkLesson(
  moduleId: number,
  lessonId: number,
): Promise<boolean> {
  const removed = await db
    .delete(moduleLessonsTable)
    .where(
      and(
        eq(moduleLessonsTable.moduleId, moduleId),
        eq(moduleLessonsTable.lessonId, lessonId),
      ),
    )
    .returning({ id: moduleLessonsTable.id });

  if (removed.length === 0) return false;

  await invalidateCourseDetailsCache(await getCourseSlugForModuleId(moduleId));
  return true;
}

/**
 * Move a placement within its course — to another module, or to another slot
 * in the same one. Cross-COURSE moves are forbidden by the UI's drag whitelist
 * and are not expressible here: the placement row keeps its identity and only
 * its module and rank change.
 */
export async function movePlacement(input: {
  lessonId: number;
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<Placement | null> {
  const [updated] = await db
    .update(moduleLessonsTable)
    .set({
      moduleId: input.targetModuleId,
      rank: rankBetween(
        input.prevLessonId,
        input.nextLessonId,
        input.targetModuleId,
      ),
      updatedAt: sql`now()`,
    })
    .where(eq(moduleLessonsTable.lessonId, input.lessonId))
    .returning({
      id: moduleLessonsTable.id,
      moduleId: moduleLessonsTable.moduleId,
      lessonId: moduleLessonsTable.lessonId,
      rank: moduleLessonsTable.rank,
      dependsOn: moduleLessonsTable.dependsOn,
    });

  if (!updated) return null;

  await invalidateCourseDetailsCache(
    await getCourseSlugForModuleId(input.targetModuleId),
  );

  return toPlacement(updated);
}
```

> **Note for the implementer:** `movePlacement`'s `where` clause matches on `lessonId` alone, which is correct only while a lesson has one placement per course *and* the UI forbids cross-course drags. Add `and(inArray(moduleLessonsTable.moduleId, <modules of this course>))` if that ever changes. Leave a comment saying so.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/db/__tests__/placement-writes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/placements.ts src/db/__tests__/placement-writes.test.ts
git commit -m "feat(db): link, unlink and move placements

linkLesson enforces one placement per course in the write path — the
unique index only covers (module_id, lesson_id)."
```

---

## Task 4: `getCourseBoard` reads through placements

The existing editor keeps working, now sourcing lessons from `module_lessons`. This is the proof the read model is equivalent.

**Files:**
- Modify: `src/db/admin.ts` (`getCourseBoard`, around line 397)
- Test: `src/db/__tests__/course-board-placements.test.ts`

**Interfaces:**
- Consumes: `getPlacementsForCourse` (Task 2).
- Produces: `getCourseBoard` unchanged in signature and in the shape it returns — `BoardLesson.rank` and `BoardLesson.dependsOn` now come from the placement.

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/course-board-placements.test.ts`. Assert on what the consumer receives — the board's lessons — not that a query ran:

```ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getPlacementsForCourse = vi.hoisted(() => vi.fn());
vi.mock('#/db/placements', () => ({
  getPlacementsForCourse,
  getCourseIdsForLesson: vi.fn().mockResolvedValue([]),
  getCourseCountsForLessons: vi.fn().mockResolvedValue(new Map()),
}));

// … stub #/db and #/db/schema following lesson-access-course-id.test.ts …

const { getCourseBoard } = await import('#/db/admin');

beforeEach(() => vi.clearAllMocks());

describe('getCourseBoard', () => {
  it('orders a module’s lessons by PLACEMENT rank, not lesson rank', async () => {
    // Lesson 9 ranks 1 on the lesson row but 2 in this course; lesson 10 the
    // reverse. If the board still read lessons.rank the order would invert.
    getPlacementsForCourse.mockResolvedValue([
      { id: 1, moduleId: 4, lessonId: 10, rank: 1, dependsOn: [] },
      { id: 2, moduleId: 4, lessonId: 9, rank: 2, dependsOn: [] },
    ]);
    // … stub the lesson rows for 9 and 10 with lessons.rank 1 and 2 …

    const board = await getCourseBoard(3);

    expect(board?.modules[0].lessons.map((l) => l.id)).toEqual([10, 9]);
  });

  it('takes dependsOn from the placement, so two courses can differ', async () => {
    getPlacementsForCourse.mockResolvedValue([
      { id: 1, moduleId: 4, lessonId: 9, rank: 1, dependsOn: ['intro'] },
    ]);

    const board = await getCourseBoard(3);

    expect(board?.modules[0].lessons[0].dependsOn).toEqual(['intro']);
  });

  it('omits a lesson that has no placement in this course', async () => {
    getPlacementsForCourse.mockResolvedValue([]);

    const board = await getCourseBoard(3);

    expect(board?.modules[0].lessons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/course-board-placements.test.ts`
Expected: FAIL — lessons come back in lesson-rank order, and `dependsOn` is empty.

- [ ] **Step 3: Rewrite `getCourseBoard`**

Replace the `lessonsTable.moduleId` join with a placement join. The lesson row is still the source of name, slug, video and every gate; the placement supplies `rank` and `dependsOn`, and decides membership:

```ts
  const placements = await getPlacementsForCourse(courseId);
  const lessonIds = placements.map((p) => p.lessonId);
  const lessonRows = lessonIds.length
    ? await db
        .select({ /* … existing lesson columns, minus rank … */ })
        .from(lessonsTable)
        .where(inArray(lessonsTable.id, lessonIds))
    : [];
  const lessonById = new Map(lessonRows.map((l) => [l.id, l]));

  // Placement order is authoritative: a lesson sits third here and eighth in
  // another course, so lessons.rank cannot decide this.
  for (const p of placements) {
    const lesson = lessonById.get(p.lessonId);
    if (!lesson) continue;
    moduleMap.get(p.moduleId)?.lessons.push({
      ...lesson,
      rank: p.rank,
      dependsOn: p.dependsOn,
    });
  }
  for (const m of moduleMap.values()) m.lessons.sort((a, b) => a.rank - b.rank);
```

Delete the now-dead `lessonDependenciesTable` join in this function.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/db/__tests__/course-board-placements.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS. `src/db/__tests__/admin-course-cache-invalidation.test.ts` and the module-lessons route tests exercise this path — fix any fallout here, not by weakening the new test.

- [ ] **Step 6: Verify in the running app**

Run `pnpm dev`, open `/admin/<id>/editor`. The board must look identical to before: same modules, same lessons, same order.

- [ ] **Step 7: Commit**

```bash
git add src/db/admin.ts src/db/__tests__/course-board-placements.test.ts
git commit -m "refactor(db): source the course board from module_lessons

Placement rank and dependsOn are authoritative; the lesson row still
supplies name, video and every gate."
```

---

## Task 5: Remaining `lessons.module_id` readers

Move every other consumer across so Task 7 can drop the column. Grep is the checklist:

```bash
grep -rn "lessonsTable.moduleId\|lessons\.module_id" src --include="*.ts" --include="*.tsx" | grep -v __tests__
```

**Files:**
- Modify: `src/db/library.ts` (the `lessonModule` alias join, lines 42–78)
- Modify: `src/db/course.ts` (~line 103), `src/db/course-content.ts`, `src/db/course-progress.ts` (~line 61), `src/db/lesson-access.ts`, `src/db/lesson-playback.ts`, `src/db/course-last-viewed.ts`
- Modify: `src/db/admin.ts` — `createLesson`, `deleteLesson`, `moveLesson`
- Test: `src/db/__tests__/library-placement-scoping.test.ts`

**Interfaces:**
- Consumes: `getPlacementsForCourse`, `getCourseIdsForLesson`, `movePlacement` (Tasks 2–3).
- Produces: `createLesson` additionally writes a placement and sets `orgId`; `moveLesson` delegates to `movePlacement`; `getCourseIdForLessonId` is replaced at its call sites (see below).

- [ ] **Step 1: Write the failing test for library scoping**

`getLibraryForCourse` (`src/db/library.ts:66`) joins `lessons.module_id → lesson_module.course_id`. Create `src/db/__tests__/library-placement-scoping.test.ts`:

```ts
// @vitest-environment node
// … stub #/db and #/db/schema per the house pattern …

describe('getLibraryForCourse', () => {
  it('finds a lesson’s files through its PLACEMENT in this course', async () => {
    // Lesson 9 is taught by courses 3 and 7. Asking for course 3 must return
    // its file; the old lessons.module_id join could only ever answer for one.
    // … arrange rows … 
    const { files } = await getLibraryForCourse(3);
    expect(files.map((f) => f.name)).toContain('checklist.pdf');
  });

  it('still returns the 11 module-only rows, which have no lesson', async () => {
    const { files } = await getLibraryForCourse(3);
    expect(files.map((f) => f.name)).toContain('module-brief.pdf');
  });

  it('returns a lesson’s files in EVERY course teaching it', async () => {
    const { files } = await getLibraryForCourse(7);
    expect(files.map((f) => f.name)).toContain('checklist.pdf');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/library-placement-scoping.test.ts`
Expected: FAIL — the third case returns nothing, because a lesson had one module.

- [ ] **Step 3: Rewrite the `library.ts` join**

Replace the `lessonModule` alias with a placement hop, keeping the module-only branch and the "lesson's own module wins" rule:

```ts
    .leftJoin(
      moduleLessonsTable,
      eq(blobFileAssignmentsTable.lessonId, moduleLessonsTable.lessonId),
    )
    .leftJoin(lessonModule, eq(moduleLessonsTable.moduleId, lessonModule.id))
```

Update the doc comment: scoping now runs through `module_lessons`, and a lesson's files appear in every course teaching it — correct, because the file belongs to the lesson.

- [ ] **Step 4: Move the remaining readers**

For each file, replace `eq(lessonsTable.moduleId, modulesTable.id)` with a join through `moduleLessonsTable`:

```ts
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(moduleLessonsTable.moduleId, modulesTable.id))
```

In `src/db/course-progress.ts` (~line 61) also take `rank` from `moduleLessonsTable.rank`.

In `src/db/lesson-access.ts`, `getCourseIdForLessonId` and `getCourseSlugForLessonId` can no longer give one answer. **Do not delete them yet** — Task 6 replaces their call sites. Mark each:

```ts
/**
 * @deprecated A lesson can be taught by many courses. Guards must use
 * `requireAdmin` (org-level lesson edits) or resolve the course from the
 * MODULE being written to. Removed in Task 6; still used by learner-side
 * reads where the course slug is already known from the URL.
 */
```

In `src/db/admin.ts`:
- `createLesson` — insert the lesson with `orgId` (resolved from the module's course) and no `moduleId`/`rank`, then `linkLesson` it into the module in the same transaction.
- `moveLesson` — delegate to `movePlacement` and keep the exported name so callers are untouched.
- `deleteLesson` — unchanged (the `module_lessons` FK cascades), but extend its doc comment to say deletion removes the lesson from **every** course.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS. Expect fallout in `course-has-video.test.ts`, `course-content-gating.test.ts`, `lesson-playback.test.ts`, `my-courses-staff.test.ts` — these stub `lessonsTable.moduleId`. Update the stubs to include `moduleLessonsTable`; do not weaken assertions.

- [ ] **Step 6: Confirm nothing reads the old column**

Run: `grep -rn "lessonsTable.moduleId" src --include="*.ts" --include="*.tsx" | grep -v __tests__`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/db/
git commit -m "refactor(db): move every lessons.module_id reader to placements

Library file scoping now resolves through module_lessons, so a lesson's
files appear in every course teaching it — the file belongs to the lesson."
```

---

## Task 6: Lesson mutations become org-guarded

Implements the decision recorded above.

**Files:**
- Modify: `src/routes/api/admin/lessons.$lessonId.ts`, `lessons.$lessonId.material.ts`, `lessons.$lessonId.video.ts`, `lessons.$lessonId.video-playback.ts`
- Modify: `src/db/lesson-access.ts` (drop the deprecated helpers if now unused)
- Test: `src/routes/api/admin/__tests__/lesson-mutation-guard.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `#/lib/permissions.server`.
- Produces: lesson-content routes guarded by `requireAdmin`; placement routes stay on `requireCoursePermission`.

- [ ] **Step 1: Write the failing test**

```ts
describe('PATCH /api/admin/lessons/:lessonId', () => {
  it('refuses course staff who are not org admins', async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    const res = await patchLessonHandler(request, '9');
    expect(res.status).toBe(403);
    // The consumer is the DB call — it must never have happened.
    expect(updateLessonConfig).not.toHaveBeenCalled();
  });

  it('allows an org admin', async () => {
    requireAdmin.mockResolvedValueOnce(undefined);
    const res = await patchLessonHandler(request, '9');
    expect(res.status).toBe(200);
    expect(updateLessonConfig).toHaveBeenCalled();
  });

  it('does not resolve a single course for the lesson', async () => {
    await patchLessonHandler(request, '9');
    // The whole point: a lesson has no one course any more.
    expect(getCourseIdForLessonId).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/routes/api/admin/__tests__/lesson-mutation-guard.test.ts`
Expected: FAIL — the handler still calls `getCourseIdForLessonId` + `requireCoursePermission`.

- [ ] **Step 3: Swap the guards**

In each lesson-content route, replace the `getCourseIdForLessonId` + `requireCoursePermission` pair with `requireAdmin`, and add:

```ts
// Org-level, not course-scoped: a lesson can be taught by several courses, so
// "which course authorises this edit?" has no single answer. `lessons.org_id`
// makes lessons org-owned, and the guard follows ownership. Composing a course
// from the library stays course-scoped — see the placement routes.
```

- [ ] **Step 4: Run the test and the suite**

Run: `pnpm vitest run src/routes/api/admin/__tests__/lesson-mutation-guard.test.ts && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/admin src/db/lesson-access.ts \
        src/routes/api/admin/__tests__/lesson-mutation-guard.test.ts
git commit -m "feat(admin-api): lesson edits are org-guarded, placements stay course-guarded

A lesson taught by three courses has no single authorising course. Guard
follows ownership: lessons.org_id means requireAdmin."
```

---

## Task 7: Contract — drop the old columns

Only now that nothing reads them.

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrate-drop-lesson-module-id.ts`
- Modify: `package.json`
- Test: `src/db/__tests__/drop-lesson-module-id-migration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `lessonsTable` without `moduleId` or `rank`; `lessonDependenciesTable` removed from `schema.ts`.

- [ ] **Step 1: Write the failing test**

```ts
describe('migrateDropLessonModuleId', () => {
  it('verifies every lesson has a placement before dropping anything', async () => {
    const all = statements().join('\n');
    const check = all.indexOf('left join "module_lessons"');
    const drop = all.indexOf('drop column');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(check);
  });

  it('drops module_id, rank and lesson_dependencies', async () => {
    const all = statements().join('\n');
    expect(all).toContain('drop column if exists "module_id"');
    expect(all).toContain('drop column if exists "rank"');
    expect(all).toContain('drop table if exists "lesson_dependencies"');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/drop-lesson-module-id-migration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the contract migration**

```ts
export async function migrateDropLessonModuleId(): Promise<void> {
  // Refuse to drop the old source of truth while any lesson would be orphaned
  // by it. This is the last moment the data can be checked cheaply.
  const orphans = await db.execute(sql`
    select count(*)::int as "n"
    from "lessons" l
    left join "module_lessons" ml on ml."lesson_id" = l."id"
    where ml."id" is null and l."module_id" is not null;
  `);
  const n = Number((orphans as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  if (n > 0) {
    throw new Error(
      `${n} lesson(s) still have module_id but no placement. ` +
        `Re-run pnpm db:migrate-lesson-placements first.`,
    );
  }

  console.info('Dropping lessons.module_id and lessons.rank…');
  await db.execute(sql`alter table "lessons" drop column if exists "module_id";`);
  await db.execute(sql`alter table "lessons" drop column if exists "rank";`);

  console.info('Dropping lesson_dependencies…');
  await db.execute(sql`drop table if exists "lesson_dependencies";`);

  console.info('Done.');
}
```

Plus the same `import.meta.url` runner block and a `db:migrate-drop-lesson-module-id` script.

- [ ] **Step 4: Remove the columns from `schema.ts`**

Delete `moduleId` and `rank` from `lessonsTable`, delete `lessonDependenciesTable`, its relations and its GIN index line, and remove `module` from `lessonsTableRelations`.

- [ ] **Step 5: Run the tests, then typecheck**

Run: `pnpm test && pnpm check`
Expected: PASS with no references to the removed fields. Any `tsc` error here is a reader Task 5 missed — fix the reader.

- [ ] **Step 6: Run the migration and verify the app**

Run: `pnpm db:migrate-drop-lesson-module-id`, then `pnpm dev` and load a learner course page *and* the admin board.

- [ ] **Step 7: Commit**

```bash
git add src/db package.json
git commit -m "feat(db): drop lessons.module_id, lessons.rank and lesson_dependencies

module_lessons is now the only source of placement truth."
```

---

## Task 8: Library and editor-board queries + schemas

**Files:**
- Create: `src/db/editor.ts`
- Modify: `src/lib/admin-schemas.ts`
- Test: `src/db/__tests__/editor-queries.test.ts`

**Interfaces:**
- Consumes: `getCourseCountsForLessons` (Task 2).
- Produces:
  - `getOrgLibrary(orgId: number): Promise<OrgLibrary>` where `OrgLibrary = { disciplines: LibraryDiscipline[]; untitled: LibraryLesson[] }`
  - `getOrgEditorBoard(orgId: number): Promise<CourseBoard[]>`
  - Zod: `libraryLessonSchema` (`{ id, name, slug, isConfigured, isAvailable, courseCount }`), `libraryDisciplineSchema` (`{ id, name, slug, lessons }`), `orgLibrarySchema`, `orgEditorBoardSchema = z.array(courseBoardSchema)`

- [ ] **Step 1: Write the failing test**

```ts
describe('getOrgLibrary', () => {
  it('files a null-discipline lesson under untitled, not a discipline', async () => {
    // … stub one lesson with disciplineId null …
    const lib = await getOrgLibrary(1);
    expect(lib.untitled.map((l) => l.id)).toEqual([9]);
    expect(lib.disciplines.flatMap((d) => d.lessons)).toEqual([]);
  });

  it('carries the course count each card shows', async () => {
    getCourseCountsForLessons.mockResolvedValue(new Map([[9, 2]]));
    const lib = await getOrgLibrary(1);
    expect(lib.untitled[0].courseCount).toBe(2);
  });

  it('gives an unplaced lesson a count of zero rather than omitting it', async () => {
    getCourseCountsForLessons.mockResolvedValue(new Map());
    const lib = await getOrgLibrary(1);
    expect(lib.untitled[0].courseCount).toBe(0);
  });

  it('includes only lessons owned by this org', async () => {
    const lib = await getOrgLibrary(1);
    expect(whereClauseFor(db.select)).toContain('org_id');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/db/__tests__/editor-queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the Zod schemas to `src/lib/admin-schemas.ts`**

```ts
/** A lesson as the library shows it — no gates: those are edited in its config. */
export const libraryLessonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  isConfigured: z.boolean(),
  isAvailable: z.boolean(),
  /**
   * How many distinct courses teach this lesson. Drives the "in N courses"
   * badge — a cross-reference, not a status, so it never dims the card: a
   * lesson can be in the 2-Week and not the Mini.
   */
  courseCount: z.number(),
});
export type LibraryLesson = z.infer<typeof libraryLessonSchema>;

export const libraryDisciplineSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  lessons: z.array(libraryLessonSchema),
});
export type LibraryDiscipline = z.infer<typeof libraryDisciplineSchema>;

export const orgLibrarySchema = z.object({
  disciplines: z.array(libraryDisciplineSchema),
  /** `disciplineId IS NULL` — rendered leftmost as "Untitled". Not a real row. */
  untitled: z.array(libraryLessonSchema),
});
export type OrgLibrary = z.infer<typeof orgLibrarySchema>;

export const orgEditorBoardSchema = z.array(courseBoardSchema);
export type OrgEditorBoard = z.infer<typeof orgEditorBoardSchema>;
```

- [ ] **Step 4: Write `src/db/editor.ts`**

`getOrgLibrary` selects lessons `where orgId = ?`, left-joins `disciplines`, groups in JS, and merges `getCourseCountsForLessons`, defaulting a missing id to `0`. `getOrgEditorBoard` lists the org's courses via `course_orgs` and calls the existing `getCourseBoard` for each.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm vitest run src/db/__tests__/editor-queries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db/editor.ts src/lib/admin-schemas.ts src/db/__tests__/editor-queries.test.ts
git commit -m "feat(db): org library and editor board queries"
```

---

## Task 9: API routes and data hooks

**Files:**
- Create: `src/routes/api/admin/library.ts`, `src/routes/api/admin/editor.ts`, `src/routes/api/admin/modules.$moduleId.lessons.$lessonId.ts`
- Modify: `src/routes/api/admin/modules.$moduleId.lessons.ts` (POST accepts `lessonId` to link)
- Create: `src/data-hooks/use-library.ts`, `use-editor-board.ts`, `use-link-lesson.ts`, `use-unlink-lesson.ts`
- Modify: `src/data-hooks/keys.ts`
- Test: `src/routes/api/admin/__tests__/placement-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 8.
- Produces: `dataKeys.library()` → `['admin','library']`; `dataKeys.editorBoard()` → `['admin','editor-board']`; hooks `useLibrary()`, `useEditorBoard()`, `useLinkLesson()`, `useUnlinkLesson()`.

- [ ] **Step 1: Write the failing route test**

```ts
describe('POST /api/admin/modules/:moduleId/lessons', () => {
  it('links an existing lesson when given lessonId', async () => {
    const res = await postLessonHandler(req({ lessonId: 9 }), '40');
    expect(linkLesson).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 40, lessonId: 9 }),
    );
    expect(createLesson).not.toHaveBeenCalled();
  });

  it('still creates a new lesson when given name', async () => {
    await postLessonHandler(req({ name: 'Intro' }), '40');
    expect(createLesson).toHaveBeenCalled();
    expect(linkLesson).not.toHaveBeenCalled();
  });

  it('answers 409 with a reason when the course already teaches it', async () => {
    linkLesson.mockResolvedValueOnce('duplicate');
    const res = await postLessonHandler(req({ lessonId: 9 }), '40');
    expect(res.status).toBe(409);
    // A refusal must say what it is, not just fail.
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining('already'),
    });
  });

  it('refuses without structure:create on the target course', async () => {
    requireCoursePermission.mockRejectedValueOnce(new ForbiddenError());
    expect((await postLessonHandler(req({ lessonId: 9 }), '40')).status).toBe(403);
    expect(linkLesson).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/modules/:moduleId/lessons/:lessonId', () => {
  it('unlinks without deleting the lesson', async () => {
    await deletePlacementHandler(request, '40', '9');
    expect(unlinkLesson).toHaveBeenCalledWith(40, 9);
    expect(deleteLesson).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/routes/api/admin/__tests__/placement-routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the routes**

Follow `modules.$moduleId.lessons.ts` exactly: parse the id, resolve the course *before* guarding, `absentResourceResponse` for a missing module, `requireCoursePermission(..., 'structure', 'create' | 'update' | 'delete')`, Zod-parse the body. Extend `createLessonInputSchema` to a discriminated union of `{ name }` and `{ lessonId }`.

`GET /api/admin/library` and `/api/admin/editor` self-guard with `requireAdmin` and resolve the caller's org from the session.

- [ ] **Step 4: Write the hooks**

`useLibrary` / `useEditorBoard`: `useQuery` with `staleTime: 30_000`, parsing through the Task 8 schemas — matching `use-course-board.ts`. `useLinkLesson` / `useUnlinkLesson`: `useMutation` with `onSuccess` invalidating **both** `dataKeys.editorBoard()` and `dataKeys.library()` — the badge count changes with every link.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/routes/api/admin/__tests__/placement-routes.test.ts && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/admin src/data-hooks
git commit -m "feat(admin-api): library, editor board and placement routes"
```

---

## Task 10: `dnd-ids` gains a library type

Small, but every later drag rule depends on it, and the current parser is already subtly wrong for the new id.

**Files:**
- Modify: `src/lib/dnd-ids.ts`
- Test: `src/lib/__tests__/dnd-ids.test.ts`

**Interfaces:**
- Produces: `DndType = 'module' | 'lesson' | 'container' | 'library-lesson'`; `libraryLessonDndId(id: number) => \`library-lesson-${id}\``; `parseDndId` handling all four.

- [ ] **Step 1: Write the failing test**

```ts
describe('parseDndId', () => {
  it('parses a library lesson id', () => {
    expect(parseDndId('library-lesson-5')).toEqual({
      type: 'library-lesson',
      id: 5,
    });
  });

  it('still parses a placed lesson id', () => {
    expect(parseDndId('lesson-5')).toEqual({ type: 'lesson', id: 5 });
  });

  it('does not confuse a library lesson with a placed one', () => {
    // The bug the old split('-') would produce: prefix 'library', rest 'lesson'.
    expect(parseDndId('library-lesson-5')?.type).not.toBe('lesson');
  });

  it('rejects an unknown prefix', () => {
    expect(parseDndId('discipline-5')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/lib/__tests__/dnd-ids.test.ts`
Expected: FAIL — `library-lesson-5` parses to `null` (`Number('lesson')` is `NaN`).

- [ ] **Step 3: Fix the parser to split on the LAST hyphen**

```ts
export function parseDndId(
  id: string | number,
): { type: DndType; id: number } | null {
  const raw = String(id);
  // Split on the LAST hyphen: the type itself contains one ('library-lesson').
  const at = raw.lastIndexOf('-');
  if (at === -1) return null;
  const prefix = raw.slice(0, at);
  const num = Number(raw.slice(at + 1));
  if (!Number.isInteger(num)) return null;
  if (
    prefix === 'module' ||
    prefix === 'lesson' ||
    prefix === 'container' ||
    prefix === 'library-lesson'
  ) {
    return { type: prefix, id: num };
  }
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/lib/__tests__/dnd-ids.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dnd-ids.ts src/lib/__tests__/dnd-ids.test.ts
git commit -m "feat(dnd): add library-lesson id type, parse on the last hyphen"
```

---

## Task 11: Library presentational components

**Files:**
- Create: `src/components/admin/library-lesson-card.tsx`, `discipline-column.tsx`, `lesson-library.tsx`
- Test: `src/components/admin/__tests__/library-lesson-card.test.tsx`, `discipline-column.test.tsx`

**Interfaces:**
- Consumes: `LibraryLesson`, `LibraryDiscipline` (Task 8).
- Produces:
  - `LibraryLessonCard({ lesson, dragHandleProps?, onEdit? })`
  - `DisciplineColumn({ name, lessonCount, children })`
  - `LessonLibrary({ children })`

All hookless. Build on `ClampedText`, `LessonVideoTile`, `TooltipIconButton`, `ScrollArea`.

- [ ] **Step 1: Write the failing card test**

```tsx
describe('LibraryLessonCard', () => {
  it('names the courses in the badge’s accessible name, not just a number', () => {
    render(<LibraryLessonCard lesson={{ ...base, courseCount: 2 }} />);
    // A bare "2" tells a screen-reader user nothing.
    expect(
      screen.getByLabelText(/in 2 courses/i),
    ).toBeDefined();
  });

  it('shows no badge for an unplaced lesson', () => {
    render(<LibraryLessonCard lesson={{ ...base, courseCount: 0 }} />);
    expect(screen.queryByLabelText(/in \d+ course/i)).toBeNull();
  });

  it('stays draggable even when already used', () => {
    // Never dimmed: a lesson can be in the 2-Week and not the Mini.
    const { container } = render(
      <LibraryLessonCard lesson={{ ...base, courseCount: 3 }} />,
    );
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('marks a lesson with no video as Draft', () => {
    render(
      <LibraryLessonCard lesson={{ ...base, isAvailable: false }} />,
    );
    expect(screen.getByText('Draft')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm vitest run src/components/admin/__tests__/library-lesson-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the three components**

`LibraryLessonCard` mirrors `LessonCard`'s structure — `LessonVideoTile`, `ClampedText`, `Draft` chip — plus the badge:

```tsx
{lesson.courseCount > 0 && (
  <span
    className="shrink-0 rounded bg-apple-3 px-1.5 py-0.5 font-medium text-apple-11 text-xs"
    aria-label={`In ${lesson.courseCount} ${lesson.courseCount === 1 ? 'course' : 'courses'}`}
  >
    {lesson.courseCount}
  </span>
)}
```

Deliberately `apple-*` (navy): a cross-reference, not a status. Do not use `accent-*` in this component.

`DisciplineColumn`: `flex w-72 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2`, sticky header with name + count, body `min-h-0 flex-1 overflow-y-auto`.
`LessonLibrary`: header + `flex gap-3 overflow-x-auto p-3` rail.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/components/admin/__tests__/library-lesson-card.test.tsx src/components/admin/__tests__/discipline-column.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/library-lesson-card.tsx \
        src/components/admin/discipline-column.tsx \
        src/components/admin/lesson-library.tsx \
        src/components/admin/__tests__/
git commit -m "feat(admin-ui): library pane presentational components"
```

---

## Task 12: Course-column presentational components

**Files:**
- Create: `src/components/admin/module-accordion-item.tsx`, `course-column.tsx`, `course-rail.tsx`, `editor-pane-splitter.tsx`
- Test: `src/components/admin/__tests__/module-accordion-item.test.tsx`

**Interfaces:**
- Consumes: `BoardModule`, `BoardCourse`.
- Produces:
  - `ModuleAccordionItem({ module, dragHandleProps?, onAddLesson?, onEditModule?, onDeleteModule?, lessonsSlot })`
  - `CourseColumn({ course, children, onEditCourse? })`
  - `CourseRail({ onNewCourse?, children })`
  - `EditorPaneSplitter({ onPointerDown, ariaValueNow })`

Follow `src/components/admin/sortable-onboarding-category.tsx` — the existing sortable-accordion pattern — and `src/components/sidebar/module-accordion.tsx` for Base UI `Accordion` usage. Import as `import { Accordion } from '@base-ui/react/Accordion'`.

- [ ] **Step 1: Write the failing test**

```tsx
describe('ModuleAccordionItem', () => {
  it('states the lesson count in the trigger', () => {
    render(<ModuleAccordionItem module={{ ...mod, lessons: [a, b] }} lessonsSlot={null} />);
    expect(screen.getByText('2')).toBeDefined();
  });

  it('keeps the drag handle out of the accordion toggle', () => {
    // Nested inside the trigger, grabbing the handle would also collapse the
    // module mid-drag.
    const { container } = render(<ModuleAccordionItem module={mod} lessonsSlot={null} />);
    const trigger = container.querySelector('[data-accordion-trigger]');
    expect(trigger?.querySelector('[aria-label="Drag to reorder module"]')).toBeNull();
  });

  it('renders the lessons slot inside the panel', () => {
    render(<ModuleAccordionItem module={mod} lessonsSlot={<div>slot</div>} />);
    expect(screen.getByText('slot')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm vitest run src/components/admin/__tests__/module-accordion-item.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

The drag handle sits as a **sibling** of `Accordion.Trigger`, inside the header row — not within it.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/components/admin/__tests__/module-accordion-item.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/module-accordion-item.tsx \
        src/components/admin/course-column.tsx \
        src/components/admin/course-rail.tsx \
        src/components/admin/editor-pane-splitter.tsx \
        src/components/admin/__tests__/module-accordion-item.test.tsx
git commit -m "feat(admin-ui): course rail, course column and module accordion"
```

---

## Task 13: The editor container and drag whitelist

The heart of the feature.

**Files:**
- Create: `src/components/admin/editor-container.tsx`, `library-lesson-container.tsx`
- Modify: `src/atoms/admin.ts`
- Test: `src/components/admin/__tests__/editor-drag-rules.test.ts`

**Interfaces:**
- Consumes: Tasks 9–12.
- Produces: `EditorContainer()`; atoms `activeDragLibraryLessonIdAtom`, `splitterPositionAtom`, `expandedModulesAtom`.
- Produces a pure helper, extracted so the rules are testable without a DOM: `resolveDrop(board: OrgEditorBoard, activeId: string|number, overId: string|number): { kind: 'link'; moduleId: number; lessonId: number } | { kind: 'move'; ... } | { kind: 'forbidden'; reason: string } | null`

- [ ] **Step 1: Write the failing drag-rule test**

The whitelist is the spec's sharpest requirement, so test the pure resolver:

```ts
describe('resolveDrop', () => {
  it('links a library lesson dropped into a module', () => {
    expect(resolveDrop(board, 'library-lesson-9', 'container-40')).toEqual({
      kind: 'link',
      moduleId: 40,
      lessonId: 9,
    });
  });

  it('moves a placed lesson between modules of the SAME course', () => {
    expect(resolveDrop(board, 'lesson-9', 'container-41')).toMatchObject({
      kind: 'move',
      moduleId: 41,
    });
  });

  it('forbids dragging a placed lesson into another course', () => {
    // module 90 belongs to course 7; lesson 9 is placed in course 3.
    const result = resolveDrop(board, 'lesson-9', 'container-90');
    expect(result).toMatchObject({ kind: 'forbidden' });
    // A refusal has to say why — it reaches the user as a message.
    expect(result).toMatchObject({ reason: expect.stringMatching(/course/i) });
  });

  it('forbids dragging a library lesson into another discipline', () => {
    expect(
      resolveDrop(board, 'library-lesson-9', 'discipline-2'),
    ).toMatchObject({ kind: 'forbidden' });
  });

  it('forbids linking into a course that already teaches the lesson', () => {
    expect(
      resolveDrop(board, 'library-lesson-5', 'container-40'),
    ).toMatchObject({ kind: 'forbidden', reason: expect.stringMatching(/already/i) });
  });

  it('returns null when there is no drop target', () => {
    expect(resolveDrop(board, 'lesson-9', 'nonsense')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm vitest run src/components/admin/__tests__/editor-drag-rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolveDrop` and the container**

`resolveDrop` lives in its own module (`src/components/admin/resolve-drop.ts`) so it stays pure and testable. `EditorContainer` owns one `DndContext` across both panes, with `collisionDetection` filtered by the active item's type:

```ts
// A placed lesson may only target droppables inside ITS OWN course column.
// Filtering the candidate set here means a cross-course drag has nowhere to
// land and springs back, rather than being accepted and then rejected.
```

Auto-expand on hover: `onDragOver` writes the hovered module id into `expandedModulesAtom` after ~600ms, otherwise a collapsed module can never be dropped into.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/components/admin/__tests__/editor-drag-rules.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify each rule by hand**

Run `pnpm dev`, open `/admin/editor`, and confirm: library → module links; within-course move works; course → course springs back with a message; discipline → discipline springs back.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/editor-container.tsx \
        src/components/admin/library-lesson-container.tsx \
        src/components/admin/resolve-drop.ts src/atoms/admin.ts \
        src/components/admin/__tests__/editor-drag-rules.test.ts
git commit -m "feat(admin-ui): editor DndContext and drag whitelist

Cross-course and cross-discipline drags are filtered out of the collision
set, so they have nowhere to land rather than being rejected after drop."
```

---

## Task 14: Route move, remove-vs-delete, and cleanup

**Files:**
- Create: `src/routes/_authed/admin.editor.tsx`
- Modify: `src/routes/_authed/admin.$courseId.editor.tsx` (redirect)
- Modify: `src/components/admin/delete-lesson-dialog-container.tsx`
- Delete: `module-board-container.tsx`, `module-column.tsx`, `sortable-module-column.tsx`, `course-board.tsx`, `course-board-container.tsx`
- Test: `src/routes/_authed/__tests__/editor-route.test.ts`, `src/components/admin/__tests__/delete-lesson-copy.test.tsx`

**Interfaces:**
- Consumes: Task 13's `EditorContainer`.
- Produces: `/admin/editor`; `/admin/$courseId/editor` redirecting to it.

- [ ] **Step 1: Write the failing tests**

```ts
describe('/admin/$courseId/editor', () => {
  it('redirects to the org-level editor', () => {
    expect(() => Route.options.beforeLoad?.(ctx)).toThrow(
      expect.objectContaining({ to: '/admin/editor' }),
    );
  });
});

describe('delete-lesson confirmation', () => {
  it('names how many other courses lose the lesson', () => {
    render(<DeleteLessonConfirm lesson={{ name: 'Intro', courseCount: 3 }} />);
    // Deleting is not removing: it hits every course at once.
    expect(screen.getByText(/3 courses/i)).toBeDefined();
  });

  it('distinguishes remove from delete in its wording', () => {
    render(<DeleteLessonConfirm lesson={{ name: 'Intro', courseCount: 1 }} />);
    expect(screen.getByText(/permanently/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm vitest run src/routes/_authed/__tests__/editor-route.test.ts src/components/admin/__tests__/delete-lesson-copy.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`admin.editor.tsx` renders `<EditorContainer />` and reads capabilities from route context, as `admin.$courseId.editor.tsx` does today. The old route's component is replaced by a `beforeLoad` redirect.

Delete-lesson copy: *"Delete "Intro" permanently? It is taught by 3 courses and will be removed from all of them, along with every learner's progress."* Remove-from-module gets no confirm.

- [ ] **Step 4: Delete the superseded components**

Then confirm nothing imports them:

```bash
grep -rn "module-board-container\|module-column\|sortable-module-column\|course-board" src --include="*.tsx" --include="*.ts"
```
Expected: no output.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm check`
Expected: PASS, clean.

Then `pnpm dev` and walk it end to end: `/admin/editor` loads both panes; `Untitled` is leftmost; drag a library lesson into a module; confirm the badge count increments; remove it and confirm the lesson survives in the library; reorder a module; reload and confirm everything persisted; open a learner course page and confirm lessons render in placement order.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin-ui): org-level editor at /admin/editor

Replaces the per-course horizontal module board. The old route redirects.
Removing a lesson from a module leaves it in the library; deleting it
takes it out of every course, and the confirm now says so."
```

---

## Self-review

**Spec coverage.** Every section maps to a task: schema → 1; placement reads/writes → 2, 3; `getCourseBoard` → 4; `getLibraryForCourse` and other readers → 5; migration → 1 and 7; UI components → 11, 12; drag rules → 10, 13; card states → 11; remove vs delete → 14; API and hooks → 9; routing → 14; testing → embedded per task.

**One spec item deliberately deferred within the plan:** the comment on `videos_progress` / `lesson_material_progress` recording shared progress as intentional. Fold it into Task 1 Step 1 alongside the other `schema.ts` edits.

**One item the spec did not cover, resolved here:** which course authorises a lesson edit. Recorded as a decision above and implemented in Task 6. **This is the plan's most consequential judgement call and the thing to check first.**

**Type consistency.** `Placement` (Task 2) is returned by Tasks 2 and 3 and consumed by 4 and 5. `linkLesson` returns `Placement | 'duplicate'`; Task 9's route maps `'duplicate'` to 409. `LibraryLesson.courseCount` (Task 8) is what Task 11's badge reads. `resolveDrop` (Task 13) consumes `OrgEditorBoard` from Task 8.

**Known gap:** Tasks 4, 5 and 8 give test intent and the shape of the change rather than complete stub-table setup, because the house mocking pattern requires stubbing whichever tables that specific query touches. Task 2's test is the worked example to copy.
