# Staff Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two course-scoped staff roles — Subject Expert and Course Manager — so a professor has full authority over their own subject and none outside it, while admins administer the university without authoring its syllabi.

**Architecture:** Global roles stay in `user_profile_roles` and keep meaning org-level. A new `course_staff` table carries per-course assignments. Four new permission entities (`course` org-level; `structure`, `content`, `staff` per-course) and a new `requireCoursePermission` guard that unions an actor's global grants with their grants on *that course*. Seventeen `requireAdmin` content routes convert to it; the eight admin-bypass sites gain an `isCourseStaff` term.

**Tech Stack:** TanStack Start file-route API handlers, Drizzle + PostgreSQL, Zod, TanStack Query, Jotai, Base UI, Tailwind, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-20-staff-roles.md` — read it before Task 1 and keep it open. Its §9b records rulings made from facts the design session did not have.

## Global Constraints

- **Never run `db:push` or `drizzle-kit generate`.** Migrations are hand-written idempotent SQL run via `tsx`; `db:push` offers to truncate `docs` (6917 embedding rows). Follow `src/db/migrate-user-management.ts` exactly.
- **No `pgEnum`.** Closed value sets are an `as const` tuple → `z.enum(...)`, stored as `text`/`varchar`.
- PKs are `integer().primaryKey().generatedAlwaysAsIdentity()`. Timestamps are `timestamp('col', { mode: 'date' })`.
- Import alias is `#/*`. **`vitest` cannot resolve `@/`** — a test must mock the same specifier its route imports (`modules.$moduleId.ts:2-3` carries a comment about this). Several `courses.*.ts` routes import via `@/lib/...`; check before writing the mock.
- Formatting/linting is **Biome** (`npx biome check`). The repo has ~116 pre-existing errors elsewhere — ignore those, keep your files clean.
- Tests: `pnpm test`. Route tests start `// @vitest-environment node`, use a `vi.hoisted()` bag named `m`, and `vi.mock` every dependency **before** importing the handler. Copy `src/routes/api/admin/__tests__/users-route.test.ts`.
- **Assert on what the consumer received** — the arguments a mocked collaborator got — never that a value exists in state.
- **Every test must be seen to fail first.** Break the implementation, confirm red, restore.
- **A permission entity is never folded into an existing one** — that silently grants power to everyone who already holds it.
- CSS uses **logical properties** (`ms-*`, `pe-*`, `start-*`, `text-start`), never physical. Colors come from semantic tokens, never hex or Tailwind palette classes.
- Base UI before hand-rolling. Presentational components are pure and hookless (react-compiler + vitest nulls the dispatcher). Jotai for state, never `useState`.
- Baseline: **2076 passed / 28 skipped**. It must not go down.

---

## File Structure

**Created:**
| File | Responsibility |
|---|---|
| `src/db/migrate-staff-roles.ts` | Idempotent migration: `course_staff`, two role rows, seed grants |
| `src/db/course-staff.ts` | All reads/writes of `course_staff` |
| `src/lib/role-labels.ts` | `ROLE_LABELS` — display name + acronym per role |
| `src/routes/api/admin/courses.$courseId.staff.ts` | GET/PUT/DELETE course staff |
| `src/data-hooks/use-course-staff.ts` | Staff query + mutations |
| `src/components/admin/course-staff-panel.tsx` | Presentational staff list + assign control |

**Modified:** `src/db/schema.ts`, `src/lib/admin-schemas.ts`, `src/lib/permissions.server.ts`, `src/db/lesson-access.ts`, `src/db/permissions.ts`, plus 17 route files, the 8 bypass sites, `src/components/admin/admin-shell-layout.tsx`, `src/ai/prompts/viper7.ts`, `package.json`.

---

# Phase 1 — Foundation

### Task 1: Role identity, `course_staff` table, migration

**Files:**
- Create: `src/lib/role-labels.ts`, `src/db/migrate-staff-roles.ts`
- Modify: `src/lib/admin-schemas.ts` (role constants near `:11` and `:482`), `src/db/schema.ts` (after `userProfileRolesTable`), `package.json`
- Test: `src/lib/__tests__/role-labels.test.ts`

**Interfaces:**
- Produces: `SUBJECT_EXPERT_ROLE`, `COURSE_MANAGER_ROLE`, `COURSE_SCOPED_ROLES`, `STAFF_ROLES`, `ROLE_LABELS`, `courseStaffTable`, `dbCourseStaffSchema`.

- [ ] **Step 1: Add role constants to `src/lib/admin-schemas.ts`**

Beside the existing `ADMIN_ROLE` (`:11`) and `OWNER_ROLE` (`:482`):

```ts
export const SUBJECT_EXPERT_ROLE = 'subject-expert';
export const COURSE_MANAGER_ROLE = 'course-manager';

/**
 * Roles that mean something only in the context of one course.
 *
 * The stored name is `subject-expert`, not `SME`: `src/ai/prompts/viper7.ts`
 * special-cases the literal string "SME" in a clause written before any such
 * role existed, and a role name should not silently change what an AI is told.
 * The acronym people actually use lives in ROLE_LABELS.
 */
export const COURSE_SCOPED_ROLES = [
  SUBJECT_EXPERT_ROLE,
  COURSE_MANAGER_ROLE,
] as const;
export type CourseScopedRole = (typeof COURSE_SCOPED_ROLES)[number];

/** Every role that makes someone staff rather than purely a learner. */
export const STAFF_ROLES = [
  OWNER_ROLE,
  ADMIN_ROLE,
  SUBJECT_EXPERT_ROLE,
  COURSE_MANAGER_ROLE,
] as const;

export function isCourseScopedRole(name: string): name is CourseScopedRole {
  return (COURSE_SCOPED_ROLES as readonly string[]).includes(name);
}
```

Note `OWNER_ROLE` is declared at `:482`, after `ADMIN_ROLE` at `:11`. Put the new block after `OWNER_ROLE` so all four are in scope.

- [ ] **Step 2: Write the failing test for labels**

`src/lib/__tests__/role-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ROLE_LABELS, roleAcronym, roleDisplayName } from '#/lib/role-labels';
import {
  ADMIN_ROLE,
  COURSE_MANAGER_ROLE,
  OWNER_ROLE,
  SUBJECT_EXPERT_ROLE,
} from '#/lib/admin-schemas';

describe('ROLE_LABELS', () => {
  it('names every role the system knows', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      [ADMIN_ROLE, COURSE_MANAGER_ROLE, OWNER_ROLE, SUBJECT_EXPERT_ROLE].sort(),
    );
  });

  it('keeps the acronym people say separate from the stored name', () => {
    expect(roleAcronym(SUBJECT_EXPERT_ROLE)).toBe('SME');
    expect(roleDisplayName(SUBJECT_EXPERT_ROLE)).toBe('Subject Expert');
  });

  it('gives the course manager its own acronym', () => {
    expect(roleAcronym(COURSE_MANAGER_ROLE)).toBe('CRS-MGR');
    expect(roleDisplayName(COURSE_MANAGER_ROLE)).toBe('Course Manager');
  });

  it('falls back to the stored name for a role it does not know', () => {
    expect(roleDisplayName('made-up')).toBe('made-up');
    expect(roleAcronym('made-up')).toBe('made-up');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
pnpm test src/lib/__tests__/role-labels.test.ts
```

Expected: FAIL — cannot resolve `#/lib/role-labels`.

- [ ] **Step 4: Write `src/lib/role-labels.ts`**

```ts
import {
  ADMIN_ROLE,
  COURSE_MANAGER_ROLE,
  OWNER_ROLE,
  SUBJECT_EXPERT_ROLE,
} from '#/lib/admin-schemas';

/**
 * What a role is called to a person, kept apart from the string in the database.
 *
 * The stored names are an internal contract compared literally by every guard;
 * these are what an owner reads in the permission grid. Renaming must be a
 * one-line change here, never a migration — the same reasoning as LEVEL_LABELS.
 */
export const ROLE_LABELS: Record<string, { name: string; acronym: string }> = {
  [OWNER_ROLE]: { name: 'Org Owner', acronym: 'OWNER' },
  [ADMIN_ROLE]: { name: 'Org Admin', acronym: 'ADMIN' },
  [SUBJECT_EXPERT_ROLE]: { name: 'Subject Expert', acronym: 'SME' },
  [COURSE_MANAGER_ROLE]: { name: 'Course Manager', acronym: 'CRS-MGR' },
};

export function roleDisplayName(role: string): string {
  return ROLE_LABELS[role]?.name ?? role;
}

export function roleAcronym(role: string): string {
  return ROLE_LABELS[role]?.acronym ?? role;
}
```

The fallback matters: `listRoles()` returns every row in `user_roles`, and a row the code does not know must render as itself rather than as `undefined`.

- [ ] **Step 5: Run the test**

```bash
pnpm test src/lib/__tests__/role-labels.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Add `courseStaffTable` to `src/db/schema.ts`**

Place it directly after `userProfileRolesTable` (`~:740`) and its relations:

```ts
/**
 * Which courses a person is staff on, and in what capacity.
 *
 * Separate from `user_profile_roles` on purpose: that table means "global role"
 * and every existing guard reads it that way. Encoding scope as a nullable
 * `course_id` there would mean every authorization query had to remember
 * `OR course_id IS NULL`, and the two ways to forget it are silently
 * over-granting and silently under-granting.
 *
 * `assignedBy` is a plain id rather than an FK — the audit string should outlive
 * the account that wrote it, matching `courseSubscriptions.grantedBy`.
 */
export const courseStaffTable = pgTable(
  'course_staff',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => userProfileTable.userId, { onDelete: 'cascade' }),
    courseId: integer('course_id')
      .notNull()
      .references(() => coursesTable.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => userRolesTable.id, { onDelete: 'restrict' }),
    /** Acting admin's or SME's user id. */
    assignedBy: varchar('assigned_by', { length: 255 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('course_staff_user_course_role_idx').on(
      table.userId,
      table.courseId,
      table.roleId,
    ),
    index('course_staff_user_course_idx').on(table.userId, table.courseId),
    index('course_staff_course_idx').on(table.courseId),
  ],
);

export const dbCourseStaffSchema = createSelectSchema(courseStaffTable);
export type DBCourseStaff = z.infer<typeof dbCourseStaffSchema>;

export const courseStaffRelations = relations(courseStaffTable, ({ one }) => ({
  course: one(coursesTable, {
    fields: [courseStaffTable.courseId],
    references: [coursesTable.id],
  }),
  role: one(userRolesTable, {
    fields: [courseStaffTable.roleId],
    references: [userRolesTable.id],
  }),
}));
```

The `(user_id, course_id)` index exists because the hottest query in the whole feature is "what roles does this person hold on this course", run on every gated request.

- [ ] **Step 7: Write `src/db/migrate-staff-roles.ts`**

Mirror `src/db/migrate-user-management.ts` exactly — read it first for the doc-block voice, the verification read-back, and the `process.exit` shape.

```ts
/**
 * Idempotent migration for course-scoped staff roles.
 *
 * Hand-written rather than generated: `drizzle-kit push` diffs the whole schema
 * and offers to truncate `docs` (6917 embedding rows) over unrelated
 * pre-existing drift. Every statement here is safe to re-run.
 *
 * Run: pnpm db:migrate-staff-roles
 */
import { sql } from 'drizzle-orm';
import { db } from '#/db';

async function main(): Promise<void> {
  console.info('Seeding the two course-scoped roles…');
  await db.execute(sql`
    insert into "user_roles" ("name", "description")
    values
      ('subject-expert', 'Subject Expert (SME): authors a course''s structure and content'),
      ('course-manager', 'Course Manager (CRS-MGR): prepares a course''s structure')
    on conflict ("name") do nothing;
  `);

  console.info('Creating course_staff…');
  await db.execute(sql`
    create table if not exists "course_staff" (
      "id"          integer primary key generated always as identity,
      "user_id"     varchar(255) not null references "user_profiles"("user_id") on delete cascade,
      "course_id"   integer not null references "courses"("id") on delete cascade,
      "role_id"     integer not null references "user_roles"("id") on delete restrict,
      "assigned_by" varchar(255),
      "created_at"  timestamp not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists "course_staff_user_course_role_idx"
      on "course_staff" ("user_id", "course_id", "role_id");
  `);
  await db.execute(sql`
    create index if not exists "course_staff_user_course_idx"
      on "course_staff" ("user_id", "course_id");
  `);
  await db.execute(sql`
    create index if not exists "course_staff_course_idx"
      on "course_staff" ("course_id");
  `);

  // Grants ARE seeded here, unlike migrate-user-management.ts which deliberately
  // left role_permissions empty. The difference: `admin` already existed and
  // silently gaining powers would have surprised its holders, whereas these two
  // roles are new and hold nothing until granted — an unseeded SME would be a
  // role that does nothing, which is the failure this design exists to avoid.
  console.info('Seeding grants for the new roles…');
  await db.execute(sql`
    insert into "role_permissions" ("role_id", "entity", "action")
    select r."id", g."entity", g."action"
    from "user_roles" r
    cross join (values
      ('structure','create'), ('structure','read'), ('structure','update'), ('structure','delete'),
      ('content','create'),   ('content','read'),   ('content','update'),   ('content','delete'),
      ('staff','create'),     ('staff','read'),     ('staff','delete')
    ) as g("entity","action")
    where r."name" = 'subject-expert'
    on conflict do nothing;
  `);
  await db.execute(sql`
    insert into "role_permissions" ("role_id", "entity", "action")
    select r."id", g."entity", g."action"
    from "user_roles" r
    cross join (values
      ('structure','create'), ('structure','read'), ('structure','update'), ('structure','delete'),
      ('content','read')
    ) as g("entity","action")
    where r."name" = 'course-manager'
    on conflict do nothing;
  `);

  // NOTE: `admin` is deliberately NOT granted structure/content. Senior staff
  // administer the university and do not author its syllabi; an admin who needs
  // to edit a course assigns themselves as a subject-expert, which leaves a
  // record in course_staff.assigned_by. Admin DOES get course:* and staff:*.
  console.info('Seeding admin grants for course and staff…');
  await db.execute(sql`
    insert into "role_permissions" ("role_id", "entity", "action")
    select r."id", g."entity", g."action"
    from "user_roles" r
    cross join (values
      ('course','create'), ('course','read'), ('course','update'), ('course','delete'),
      ('staff','create'),  ('staff','read'),  ('staff','delete')
    ) as g("entity","action")
    where r."name" = 'admin'
    on conflict do nothing;
  `);

  const roles = await db.execute(sql`select id, name from "user_roles" order by id`);
  console.info('Schema applied. Roles now:');
  for (const row of roles.rows) console.info(`  ${row.id}  ${row.name}`);
  console.info('Owner is absent from role_permissions by design — it bypasses checks.');
  console.info('Next: assign staff to courses from /admin.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Do not run it.** A schema change against the shared database is the user's call.

- [ ] **Step 8: Add the script to `package.json`**

Beside the other `db:migrate-*` entries:

```json
"db:migrate-staff-roles": "dotenv -e .env.local -- tsx src/db/migrate-staff-roles.ts",
```

- [ ] **Step 9: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
```

Expected: clean; 2080 passed (baseline 2076 + 4).

```bash
git add src/lib/role-labels.ts src/lib/admin-schemas.ts src/db/schema.ts src/db/migrate-staff-roles.ts src/lib/__tests__/role-labels.test.ts package.json
git commit -m "feat(staff): course_staff table, two course-scoped roles, labels"
```

---

### Task 2: The `course_staff` data layer

**Files:**
- Create: `src/db/course-staff.ts`
- Test: exercised through Task 5's guard tests and Task 11's route tests

**Interfaces:**
- Consumes: `courseStaffTable`, `userRolesTable`, `COURSE_SCOPED_ROLES` (Task 1).
- Produces:
  ```ts
  getCourseRoleNames(userId: string, courseId: number): Promise<string[]>
  isCourseStaff(userId: string, courseId: number): Promise<boolean>
  isAnyCourseStaff(userId: string): Promise<boolean>
  listCourseStaff(courseId: number): Promise<CourseStaffMember[]>
  assignCourseStaff(input: AssignCourseStaffInput): Promise<{ ok: true } | { ok: false; reason: 'not-found' }>
  removeCourseStaff(userId: string, courseId: number, roleName: string): Promise<void>
  type CourseStaffMember = { userId: string; email: string; firstName: string | null; lastName: string | null; roles: string[] }
  ```

- [ ] **Step 1: Write the file**

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseStaffTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';
import { COURSE_SCOPED_ROLES } from '#/lib/admin-schemas';

export type CourseStaffMember = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
};

export type AssignCourseStaffInput = {
  userId: string;
  courseId: number;
  roleName: string;
  assignedBy: string;
};

/**
 * The roles this person holds ON this course. Empty for everyone else.
 *
 * This runs on every gated request for a signed-in user, which is why
 * `course_staff_user_course_idx` exists.
 */
export async function getCourseRoleNames(
  userId: string,
  courseId: number,
): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(courseStaffTable)
    .innerJoin(userRolesTable, eq(userRolesTable.id, courseStaffTable.roleId))
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(courseStaffTable.courseId, courseId),
      ),
    );
  return rows.map((r) => r.name);
}

/** Does this person hold any staff role on this course? Drives the gate bypass. */
export async function isCourseStaff(
  userId: string,
  courseId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: courseStaffTable.id })
    .from(courseStaffTable)
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(courseStaffTable.courseId, courseId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Staff on ANY course.
 *
 * Used only by the lesson-material parser, which takes a file and returns
 * generated material without persisting anything and without carrying a course
 * id of any kind. Course-scoping it would mean inventing an identifier the
 * client does not have, for a route that writes nothing.
 */
export async function isAnyCourseStaff(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: courseStaffTable.id })
    .from(courseStaffTable)
    .where(eq(courseStaffTable.userId, userId))
    .limit(1);
  return row !== undefined;
}

/** Everyone staffed on a course, one entry per person with their roles collected. */
export async function listCourseStaff(
  courseId: number,
): Promise<CourseStaffMember[]> {
  const rows = await db
    .select({
      userId: courseStaffTable.userId,
      email: userProfileTable.email,
      firstName: userProfileTable.firstName,
      lastName: userProfileTable.lastName,
      role: userRolesTable.name,
    })
    .from(courseStaffTable)
    .innerJoin(userRolesTable, eq(userRolesTable.id, courseStaffTable.roleId))
    .innerJoin(
      userProfileTable,
      eq(userProfileTable.userId, courseStaffTable.userId),
    )
    .where(eq(courseStaffTable.courseId, courseId));

  const byUser = new Map<string, CourseStaffMember>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) {
      existing.roles.push(row.role);
      continue;
    }
    byUser.set(row.userId, {
      userId: row.userId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      roles: [row.role],
    });
  }
  return Array.from(byUser.values());
}

/** Add a staff assignment. Idempotent — re-assigning the same role is a no-op. */
export async function assignCourseStaff(
  input: AssignCourseStaffInput,
): Promise<{ ok: true } | { ok: false; reason: 'not-found' }> {
  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, input.roleName))
    .limit(1);
  if (!role) return { ok: false, reason: 'not-found' };

  await db
    .insert(courseStaffTable)
    .values({
      userId: input.userId,
      courseId: input.courseId,
      roleId: role.id,
      assignedBy: input.assignedBy,
    })
    .onConflictDoNothing({
      target: [
        courseStaffTable.userId,
        courseStaffTable.courseId,
        courseStaffTable.roleId,
      ],
    });
  return { ok: true };
}

/** Remove one staff assignment. Silent when the row is already gone. */
export async function removeCourseStaff(
  userId: string,
  courseId: number,
  roleName: string,
): Promise<void> {
  const roleIds = db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, roleName));

  await db
    .delete(courseStaffTable)
    .where(
      and(
        eq(courseStaffTable.userId, userId),
        eq(courseStaffTable.courseId, courseId),
        inArray(courseStaffTable.roleId, roleIds),
      ),
    );
}

/** Guard rail: only these two roles may ever appear in course_staff. */
export function isAssignableCourseRole(name: string): boolean {
  return (COURSE_SCOPED_ROLES as readonly string[]).includes(name);
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
```

```bash
git add src/db/course-staff.ts
git commit -m "feat(staff): course_staff data layer"
```

---

### Task 3: Lesson and module → course **id** helpers

**Files:**
- Modify: `src/db/lesson-access.ts` (add beside `getCourseSlugForLessonId` at `:43` and `getCourseSlugForModuleId` at `:61`)
- Test: `src/db/__tests__/lesson-access-course-id.test.ts`

**Interfaces:**
- Produces: `getCourseIdForLessonId(lessonId: number): Promise<number | null>`, `getCourseIdForModuleId(moduleId: number): Promise<number | null>`

Everything in that file today returns a course **slug**; six routes in Task 8 hold a numeric id and need a numeric id back. Do **not** change the existing four functions — they have 15 call sites in `src/db/admin.ts` used for cache invalidation.

- [ ] **Step 1: Write the failing test**

`src/db/__tests__/lesson-access-course-id.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('#/db', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(m.rows),
  };
  return { db: { select: () => chain } };
});

import {
  getCourseIdForLessonId,
  getCourseIdForModuleId,
} from '#/db/lesson-access';

beforeEach(() => {
  m.rows = [];
});

describe('getCourseIdForLessonId', () => {
  it('returns the course id a lesson belongs to', async () => {
    m.rows = [{ courseId: 42 }];
    expect(await getCourseIdForLessonId(7)).toBe(42);
  });

  it('returns null for a lesson that does not exist', async () => {
    expect(await getCourseIdForLessonId(999)).toBeNull();
  });
});

describe('getCourseIdForModuleId', () => {
  it('returns the course id a module belongs to', async () => {
    m.rows = [{ courseId: 42 }];
    expect(await getCourseIdForModuleId(3)).toBe(42);
  });

  it('returns null for a module that does not exist', async () => {
    expect(await getCourseIdForModuleId(999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test src/db/__tests__/lesson-access-course-id.test.ts
```

Expected: FAIL — the two functions are not exported.

- [ ] **Step 3: Implement**

Add to `src/db/lesson-access.ts`, reading the existing `getCourseSlugForLessonId` first and matching its join shape (lesson → module → course; `lessons` has no `course_id` column):

```ts
/**
 * The course id a lesson belongs to.
 *
 * The slug-returning siblings above exist for cache invalidation, which is keyed
 * by slug. Authorization is keyed by id, and round-tripping id → slug → id would
 * be two queries to answer one question.
 */
export async function getCourseIdForLessonId(
  lessonId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ courseId: coursesTable.id })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  return row?.courseId ?? null;
}

/** The course id a module belongs to. */
export async function getCourseIdForModuleId(
  moduleId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ courseId: coursesTable.id })
    .from(modulesTable)
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(modulesTable.id, moduleId))
    .limit(1);
  return row?.courseId ?? null;
}
```

- [ ] **Step 4: Run the tests and commit**

```bash
pnpm test src/db/__tests__/lesson-access-course-id.test.ts && npx tsc --noEmit
git add src/db/lesson-access.ts src/db/__tests__/lesson-access-course-id.test.ts
git commit -m "feat(staff): resolve lesson and module to course id"
```

---

# Phase 2 — Permission model

### Task 4: Four new entities

**Files:**
- Modify: `src/lib/admin-schemas.ts` (`PERMISSION_ENTITIES` `:507`, `GRANTABLE_PERMISSIONS` `:526`), `src/components/admin/users/role-permissions-panel.tsx` (`ENTITY_LABELS` `:25`)
- Test: `src/lib/__tests__/permission-entities.test.ts`

**Interfaces:**
- Produces: `PERMISSION_ENTITIES` gains `course`, `structure`, `content`, `staff`; `COURSE_SCOPED_ENTITIES`.

- [ ] **Step 1: Extend the entity model**

```ts
/**
 * `course` is org-level: creating and deleting courses is a university act, and
 * a course-scoped role cannot create the course it would be scoped to.
 *
 * `structure`, `content` and `staff` are per-course — checked against
 * `course_staff`, not against a global role. They are separate entities because
 * a course manager prepares the scaffolding (modules, lessons, ordering, level
 * tags) while a subject expert owns the substance (material, video, quiz,
 * debrief). Folding them together would give an assistant authority over the
 * syllabus.
 */
export const PERMISSION_ENTITIES = [
  'user',
  'enrolment',
  'level',
  'course',
  'structure',
  'content',
  'staff',
] as const;
```

```ts
export const GRANTABLE_PERMISSIONS: Record<
  PermissionEntity,
  readonly PermissionAction[]
> = {
  user: ['read', 'create', 'update'],
  enrolment: ['read', 'create', 'delete'],
  level: ['read', 'update'],
  course: ['read', 'create', 'update', 'delete'],
  structure: ['read', 'create', 'update', 'delete'],
  content: ['read', 'create', 'update', 'delete'],
  staff: ['read', 'create', 'delete'],
};

/** Entities resolved against `course_staff` rather than a global role. */
export const COURSE_SCOPED_ENTITIES = ['structure', 'content', 'staff'] as const;
export type CourseScopedEntity = (typeof COURSE_SCOPED_ENTITIES)[number];

export function isCourseScopedEntity(
  entity: PermissionEntity,
): entity is CourseScopedEntity {
  return (COURSE_SCOPED_ENTITIES as readonly string[]).includes(entity);
}
```

`staff` has no `update`: an assignment is added or removed, never edited.

- [ ] **Step 2: Add the labels**

`role-permissions-panel.tsx:25` — `ENTITY_LABELS` is typed `Record<PermissionEntity, string>` and will fail `tsc` until every new entity is present:

```ts
const ENTITY_LABELS: Record<PermissionEntity, string> = {
  user: 'People',
  enrolment: 'Course access',
  level: 'Pilot levels',
  course: 'Courses',
  structure: 'Course structure',
  content: 'Course content',
  staff: 'Course staff',
};
```

- [ ] **Step 3: Write the failing test**

`src/lib/__tests__/permission-entities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  COURSE_SCOPED_ENTITIES,
  GRANTABLE_PERMISSIONS,
  PERMISSION_ENTITIES,
  isCourseScopedEntity,
} from '#/lib/admin-schemas';

describe('permission entities', () => {
  it('grants a set of actions for every entity', () => {
    for (const entity of PERMISSION_ENTITIES) {
      expect(GRANTABLE_PERMISSIONS[entity].length).toBeGreaterThan(0);
    }
  });

  it('treats structure, content and staff as course-scoped', () => {
    expect(isCourseScopedEntity('structure')).toBe(true);
    expect(isCourseScopedEntity('content')).toBe(true);
    expect(isCourseScopedEntity('staff')).toBe(true);
  });

  it('does not treat course as course-scoped — it is org-level', () => {
    expect(isCourseScopedEntity('course')).toBe(false);
  });

  it('keeps the existing org-level entities org-level', () => {
    for (const entity of ['user', 'enrolment', 'level'] as const) {
      expect(isCourseScopedEntity(entity)).toBe(false);
    }
  });

  it('never lets a course-scoped entity be granted an update on staff', () => {
    // Assignments are added or removed, never edited.
    expect(GRANTABLE_PERMISSIONS.staff).not.toContain('update');
  });

  it('lists every course-scoped entity in PERMISSION_ENTITIES', () => {
    for (const entity of COURSE_SCOPED_ENTITIES) {
      expect(PERMISSION_ENTITIES).toContain(entity);
    }
  });
});
```

- [ ] **Step 4: Run tests, verify the whole suite, commit**

```bash
pnpm test src/lib/__tests__/permission-entities.test.ts
pnpm test
```

The `role-permissions` route test asserts an unknown entity is rejected using `'course'` (`users-route.test.ts`). **`course` is now a real entity**, so that test will fail. Change its negative case to a genuinely unused string such as `'made-up'` — do **not** weaken the assertion.

```bash
git add src/lib/admin-schemas.ts src/components/admin/users/role-permissions-panel.tsx src/lib/__tests__/permission-entities.test.ts src/routes/api/admin/__tests__/users-route.test.ts
git commit -m "feat(staff): course, structure, content and staff permission entities"
```

---

### Task 5: `requireCoursePermission`

**Files:**
- Modify: `src/lib/permissions.server.ts`
- Test: `src/lib/__tests__/require-course-permission.test.ts`

**Interfaces:**
- Consumes: `getCourseRoleNames` (Task 2), `getUserPermissions`/`hasPermission` (`src/db/permissions.ts`), `hasAdminAccess`.
- Produces: `requireCoursePermission(headers, courseId, entity, action): Promise<PermittedActor & { courseRoles: string[] }>`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/require-course-permission.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserRoleNames: vi.fn(),
  getCourseRoleNames: vi.fn(),
  getUserPermissions: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course-staff', () => ({
  getCourseRoleNames: m.getCourseRoleNames,
}));
vi.mock('#/db/permissions', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#/db/permissions')>();
  return { ...actual, getUserPermissions: m.getUserPermissions };
});

import { ForbiddenError } from '#/lib/admin-functions.server';
import { requireCoursePermission } from '#/lib/permissions.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getUserRoleNames.mockResolvedValue([]);
  m.getCourseRoleNames.mockResolvedValue([]);
  m.getUserPermissions.mockResolvedValue(new Set<string>());
});

describe('requireCoursePermission', () => {
  it('admits a subject expert on their own course', async () => {
    m.getCourseRoleNames.mockResolvedValue(['subject-expert']);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    const actor = await requireCoursePermission(HEADERS, 7, 'content', 'update');

    expect(actor.userId).toBe('u1');
    expect(actor.courseRoles).toEqual(['subject-expert']);
    expect(m.getCourseRoleNames).toHaveBeenCalledWith('u1', 7);
  });

  it('refuses a subject expert on a course they are not staff on', async () => {
    // Global roles empty, and no roles on THIS course.
    m.getCourseRoleNames.mockResolvedValue([]);
    m.getUserPermissions.mockResolvedValue(new Set(['content:update']));

    await expect(
      requireCoursePermission(HEADERS, 99, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a course manager the content actions they lack', async () => {
    m.getCourseRoleNames.mockResolvedValue(['course-manager']);
    m.getUserPermissions.mockResolvedValue(
      new Set(['structure:update', 'content:read']),
    );

    await expect(
      requireCoursePermission(HEADERS, 7, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admits a course manager the structure actions they hold', async () => {
    m.getCourseRoleNames.mockResolvedValue(['course-manager']);
    m.getUserPermissions.mockResolvedValue(new Set(['structure:update']));

    await expect(
      requireCoursePermission(HEADERS, 7, 'structure', 'update'),
    ).resolves.toMatchObject({ userId: 'u1' });
  });

  it('refuses an admin authoring content — they administer, they do not author', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    m.getCourseRoleNames.mockResolvedValue([]);
    // The seed grants admin course:* and staff:*, never structure/content.
    m.getUserPermissions.mockResolvedValue(new Set(['course:update']));

    await expect(
      requireCoursePermission(HEADERS, 7, 'content', 'update'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admits an owner anywhere via the wildcard', async () => {
    m.getUserRoleNames.mockResolvedValue(['owner']);
    m.getUserPermissions.mockResolvedValue(new Set(['*']));

    await expect(
      requireCoursePermission(HEADERS, 7, 'content', 'delete'),
    ).resolves.toMatchObject({ isOwner: true });
  });

  it('refuses an anonymous caller before touching the database', async () => {
    m.getSession.mockResolvedValue(null);

    await expect(
      requireCoursePermission(HEADERS, 7, 'structure', 'read'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.getCourseRoleNames).not.toHaveBeenCalled();
  });
});
```

The fifth test is the important one: it pins the whole "admin is a jack of all trades and master of none" decision.

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm test src/lib/__tests__/require-course-permission.test.ts
```

Expected: FAIL — `requireCoursePermission` is not exported.

- [ ] **Step 3: Implement in `src/lib/permissions.server.ts`**

Read `requirePermission` (`:33`) first and match its shape — same `ForbiddenError`, same self-guarding style.

```ts
export type CourseActor = PermittedActor & { courseRoles: string[] };

/**
 * Guard for the per-course entities: `structure`, `content`, `staff`.
 *
 * Deliberately has NO admin floor. `requirePermission`'s floor exists because
 * its entities refine what an admin may do; these entities are held by people
 * who are not admins at all — a subject expert is staff on one course and
 * nothing anywhere else. Requiring admin here would make the two new roles
 * inert, which is the failure this whole design exists to avoid.
 *
 * Authority is the union of the actor's global roles and their roles on THIS
 * course, so an owner (wildcard) passes, and an admin passes only for entities
 * their global role was actually granted.
 */
export async function requireCoursePermission(
  headers: Headers,
  courseId: number,
  entity: PermissionEntity,
  action: PermissionAction,
): Promise<CourseActor> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();

  const [globalRoles, courseRoles] = await Promise.all([
    getUserRoleNames(userId),
    getCourseRoleNames(userId, courseId),
  ]);

  const permissions = await getUserPermissions([...globalRoles, ...courseRoles]);
  if (!hasPermission(permissions, entity, action)) throw new ForbiddenError();

  return {
    userId,
    roles: globalRoles,
    courseRoles,
    permissions,
    isOwner: globalRoles.includes(OWNER_ROLE),
  };
}
```

Add `import { getCourseRoleNames } from '#/db/course-staff';`.

`getUserPermissions` already unions grants across a list of role names and returns `Set(['*'])` when `owner` is present (`src/db/permissions.ts:20`), so passing the combined list needs no change there.

- [ ] **Step 4: Run the tests**

```bash
pnpm test src/lib/__tests__/require-course-permission.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Prove the tests bite**

Delete `getCourseRoleNames` from the `Promise.all` and pass only `globalRoles` to `getUserPermissions`. Run the suite: the first and fourth tests must go RED. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissions.server.ts src/lib/__tests__/require-course-permission.test.ts
git commit -m "feat(staff): requireCoursePermission, unioning global and per-course grants"
```

---

### Task 6: Relax `assertCanActOnProfile`

**Files:**
- Modify: `src/lib/permissions.server.ts:77`
- Test: `src/lib/__tests__/permissions-server.test.ts` (extend — it tests the guards directly rather than mocking them)

**Interfaces:**
- Consumes: `getRoleNamesForProfile` (`src/db/permissions.ts:53`).

Today it refuses any target holding *any* role. Once professors exist, that makes every professor unmanageable by the admins who hired them — their enrolment, level and profile all become owner-only.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/permissions-server.test.ts`, matching its existing mocking style:

```ts
describe('assertCanActOnProfile with course-scoped roles', () => {
  it('still refuses a target holding a global role', async () => {
    m.getRoleNamesForProfile.mockResolvedValue(['admin']);
    await expect(
      assertCanActOnProfile(
        { userId: 'a1', roles: ['admin'], permissions: new Set<string>(), isOwner: false },
        5,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('permits acting on a professor — a course role is not global privilege', async () => {
    m.getRoleNamesForProfile.mockResolvedValue([]);
    await expect(
      assertCanActOnProfile(
        { userId: 'a1', roles: ['admin'], permissions: new Set<string>(), isOwner: false },
        5,
      ),
    ).resolves.toBeUndefined();
  });

  it('lets an owner act on anyone', async () => {
    m.getRoleNamesForProfile.mockResolvedValue(['admin']);
    await expect(
      assertCanActOnProfile(
        { userId: 'o1', roles: ['owner'], permissions: new Set(['*']), isOwner: true },
        5,
      ),
    ).resolves.toBeUndefined();
  });
});
```

The second test passes trivially today only because `getRoleNamesForProfile` reads `user_profile_roles`, which never holds course roles. **That is the point** — this task's job is to make that guarantee explicit and documented rather than incidental, so a later change that starts writing course roles into `user_profile_roles` breaks a test rather than silently locking admins out.

- [ ] **Step 2: Document the invariant in the code**

`src/lib/permissions.server.ts:77` — the body does not change; the comment does:

```ts
/**
 * Refuse to act on a privileged target unless you are the owner.
 *
 * "Privileged" means a GLOBAL role only. `getRoleNamesForProfile` reads
 * `user_profile_roles`, which by construction never contains a course-scoped
 * role — those live in `course_staff`. That separation is load-bearing: if a
 * professor counted as privileged here, the admins who hired them could not
 * enrol them, set their pilot level, or fix their profile, and the *student*
 * half of a staff account would become unadministrable.
 */
export async function assertCanActOnProfile(
```

- [ ] **Step 3: Run and commit**

```bash
pnpm test src/lib/__tests__/permissions-server.test.ts && npx tsc --noEmit
git add src/lib/permissions.server.ts src/lib/__tests__/permissions-server.test.ts
git commit -m "docs(staff): pin the invariant that course roles are not global privilege"
```

---

# Phase 3 — Route conversion

### Task 7: The ten routes that already hold a `courseId`

**Files (all under `src/routes/api/admin/`):**

| File | Entity | Action(s) |
|---|---|---|
| `courses.$courseId.ts` | `course` | PATCH → `update`, DELETE → `delete` |
| `courses.$courseId.board.ts` | `structure` | GET → `read` |
| `courses.$courseId.lesson-posters.ts` | `structure` | GET → `read` |
| `courses.$courseId.modules.ts` | `structure` | POST → `create` |
| `courses.$courseId.onboarding.ts` | `content` | GET → `read`, POST → `update` |
| `courses.$courseId.news-sources.ts` | `content` | GET → `read`, POST → `create` |
| `courses.$courseId.news-sources.$sourceId.ts` | `content` | PATCH → `update`, DELETE → `delete` |

**Left on `requireAdmin` deliberately** — `courses.$courseId.credentials.ts`, `courses.$courseId.credentials.$provider.ts` (video-provider **secrets**, not content) and `courses.$courseId.persona.ts` (pins an org-level AI persona). Add a one-line comment at each explaining why, so the next reader does not "finish the migration".

- [ ] **Step 1: Convert one route and prove the pattern**

`courses.$courseId.board.ts` — replace the `guard` helper:

```ts
async function guard(request: Request, courseId: number): Promise<Response | null> {
  try {
    await requireCoursePermission(request.headers, courseId, 'structure', 'read');
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
```

The `courseId` must be parsed and validated **before** the guard — an unparseable id must 400, never reach the guard with `NaN`. Follow `parseProfileId` in `users.$profileId.ts` for the shape.

- [ ] **Step 2: Write a route test for it**

`src/routes/api/admin/__tests__/course-board-route.test.ts`:

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
    requireCoursePermission: vi.fn(),
    getCourseBoard: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/admin', () => ({ getCourseBoard: m.getCourseBoard }));

import { getCourseBoardHandler } from '../courses.$courseId.board';

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.getCourseBoard.mockResolvedValue({ modules: [] });
});

function req(): Request {
  return new Request('http://t/x', { method: 'GET' });
}

describe('GET /api/admin/courses/:courseId/board', () => {
  it('asks for structure:read on that specific course', async () => {
    await getCourseBoardHandler(req(), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'structure',
      'read',
    );
  });

  it('403s when refused, without reading the board', async () => {
    m.requireCoursePermission.mockRejectedValue(new m.ForbiddenError());
    const res = await getCourseBoardHandler(req(), '7');
    expect(res.status).toBe(403);
    expect(m.getCourseBoard).not.toHaveBeenCalled();
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await getCourseBoardHandler(req(), 'nonsense');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });
});
```

If the route currently has no exported handler, extract one (named export + `createFileRoute` delegating to it), matching `users.$profileId.ts`.

- [ ] **Step 3: Convert the remaining six, with a test each**

Same shape, substituting the entity and action from the table above. Each route's test asserts the exact `(courseId, entity, action)` triple and that a 403 short-circuits the DB call.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
git add src/routes/api/admin
git commit -m "feat(staff): course-scope the seven courseId-keyed admin routes"
```

---

### Task 8: The six routes keyed on a lesson or module

**Files:** `modules.$moduleId.ts`, `modules.$moduleId.lessons.ts`, `lessons.$lessonId.ts`, `lessons.$lessonId.material.ts`, `lessons.$lessonId.video.ts`, `lessons.$lessonId.video-playback.ts`

**Interfaces:**
- Consumes: `getCourseIdForLessonId`, `getCourseIdForModuleId` (Task 3); `requireCoursePermission` (Task 5).

Entity mapping:

| Route | Entity |
|---|---|
| `modules.$moduleId.ts` (sequential, dependencies, update, reorder, DELETE) | `structure` |
| `modules.$moduleId.lessons.ts` (create lesson) | `structure` |
| `lessons.$lessonId.ts` — dependencies / rename / move / DELETE | `structure` |
| `lessons.$lessonId.ts` — **config branch** | **both, per field group** |
| `lessons.$lessonId.material.ts` | `content` |
| `lessons.$lessonId.video.ts` | `content` |
| `lessons.$lessonId.video-playback.ts` | `content` (read) |

- [ ] **Step 1: Resolve upward, then guard**

Each handler resolves the course id first, and a lesson or module that does not exist **404s before the guard runs** — guarding on a `null` course id would 403 a nonexistent resource, which leaks nothing but confuses:

```ts
const courseId = await getCourseIdForLessonId(lessonId);
if (courseId === null) {
  return Response.json({ error: 'Lesson not found' }, { status: 404 });
}
try {
  await requireCoursePermission(request.headers, courseId, 'structure', 'update');
} catch (error) {
  if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
  throw error;
}
```

- [ ] **Step 2: Handle the config branch's split entities**

`lessons.$lessonId.ts:91-96` parses `updateLessonConfigInputSchema`, one `.strict()` schema carrying `isAvailable`, `levels`, `requiredSubscriptions` (**structure**) alongside `hasDebrief`, `needsVideoWatch` (**content**). Check per field group:

```ts
const STRUCTURE_CONFIG_FIELDS = [
  'isAvailable',
  'levels',
  'requiredSubscriptions',
] as const;
const CONTENT_CONFIG_FIELDS = ['hasDebrief', 'needsVideoWatch'] as const;

/**
 * One schema, two entities. A course manager may set availability and level
 * tags; only a subject expert may change whether a lesson has a debrief or
 * requires its video watched. The client sends one field at a time, so a mixed
 * body is theoretical — but it must require both rather than whichever we
 * happen to check first.
 */
const patch = config.data;
const touchesStructure = STRUCTURE_CONFIG_FIELDS.some((f) => f in patch);
const touchesContent = CONTENT_CONFIG_FIELDS.some((f) => f in patch);

try {
  if (touchesStructure) {
    await requireCoursePermission(request.headers, courseId, 'structure', 'update');
  }
  if (touchesContent) {
    await requireCoursePermission(request.headers, courseId, 'content', 'update');
  }
} catch (error) {
  if (error instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
  throw error;
}
```

- [ ] **Step 3: Test the split explicitly**

Add to the lesson route's test file:

```ts
it('lets a course manager set the level tag', async () => {
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  await patchLessonHandler(req({ levels: ['basic'] }), '10');
  expect(m.requireCoursePermission).toHaveBeenCalledWith(
    expect.anything(), 42, 'structure', 'update',
  );
  expect(m.requireCoursePermission).not.toHaveBeenCalledWith(
    expect.anything(), 42, 'content', 'update',
  );
});

it('requires content:update to change the debrief flag', async () => {
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  await patchLessonHandler(req({ hasDebrief: false }), '10');
  expect(m.requireCoursePermission).toHaveBeenCalledWith(
    expect.anything(), 42, 'content', 'update',
  );
});

it('requires BOTH when a body mixes the two groups', async () => {
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  await patchLessonHandler(req({ levels: ['basic'], hasDebrief: false }), '10');
  expect(m.requireCoursePermission).toHaveBeenCalledWith(
    expect.anything(), 42, 'structure', 'update',
  );
  expect(m.requireCoursePermission).toHaveBeenCalledWith(
    expect.anything(), 42, 'content', 'update',
  );
});

it('writes nothing when the content half is refused', async () => {
  m.requireCoursePermission
    .mockResolvedValueOnce({ userId: 'u1' })          // structure passes
    .mockRejectedValueOnce(new m.ForbiddenError());    // content refused
  const res = await patchLessonHandler(
    req({ levels: ['basic'], hasDebrief: false }), '10',
  );
  expect(res.status).toBe(403);
  expect(m.updateLessonConfig).not.toHaveBeenCalled();
});
```

That last test is the one that matters: a partial permission must not produce a partial write.

- [ ] **Step 4: Rewrite the nine `requireAdmin` test mocks**

These files mock `requireAdmin` and will break: `course-onboarding-route.test.ts`, `lesson-material-parse.test.ts`, `lesson-video-playback.test.ts`, `lessons-material.test.ts`, `module-dependencies-route.test.ts`, `news-sources-route.test.ts`. (`ai-rag.test.ts`, `personas-route.test.ts` and `uploads-policy.test.ts` keep `requireAdmin` — those routes are not converting.)

Swap the mock to `requireCoursePermission` and **add** an assertion on the entity and action. Do not merely make the old test pass — each converted route must assert what permission it demanded.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
git add src/routes/api/admin
git commit -m "feat(staff): course-scope the lesson and module routes"
```

---

### Task 9: The global and identifier-less routes

**Files:** `src/routes/api/admin/courses.ts`, `src/routes/api/admin/lesson-material.parse.ts`

- [ ] **Step 1: `courses.ts` → the org-level `course` entity**

GET (`listAdminCourses`) → `requirePermission(headers, 'course', 'read')`; POST (`createCourse`) → `requirePermission(headers, 'course', 'create')`. This keeps the admin floor, which is correct: creating a course is a university act and a course-scoped role cannot create the course it would be scoped to.

- [ ] **Step 2: `lesson-material.parse.ts` → staff on any course**

```ts
/**
 * Guarded on being staff ANYWHERE rather than on a specific course.
 *
 * This route takes a .docx and returns generated material. It persists nothing
 * and receives no course, module or lesson id of any kind — only a multipart
 * file. Course-scoping it would mean inventing an identifier the client does
 * not have, to protect a write that does not happen.
 */
const session = await auth.api.getSession({ headers: request.headers });
const userId = session?.user?.id;
if (!userId) return new Response('Forbidden', { status: 403 });

const roles = await getUserRoleNames(userId);
const allowed = hasAdminAccess(roles) || (await isAnyCourseStaff(userId));
if (!allowed) return new Response('Forbidden', { status: 403 });
```

- [ ] **Step 3: Test both**

For `parse`, assert that a signed-in user who is neither admin nor staff gets 403 **and** that `generateLessonMaterial` was not called. For `courses.ts`, assert the exact entity/action pair on each method.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
git add src/routes/api/admin
git commit -m "feat(staff): course entity for course CRUD, any-staff for the parser"
```

---

# Phase 4 — The learner side

### Task 10: `isCourseStaff` at the eight bypass sites

**Files:**
- Modify: `src/lib/lesson-gating.server.ts:99`, `src/db/course.ts:317`, `src/lib/course-resume-functions.ts:61`, `src/db/course-content.ts:146`, `src/lib/library.server.ts:46`, `src/lib/news.server.ts:47` and `:105`, `src/routes/api/course/details.ts:62`
- Test: `src/lib/__tests__/lesson-gating-staff.test.ts` plus additions to the existing suites

**Interfaces:**
- Consumes: `isCourseStaff` (Task 2).

Each site becomes `hasAdminAccess(roles) || (await isCourseStaff(userId, courseId))`. `src/lib/course-card-resume.ts` needs no change — it receives `bypassLocks` and `level` as parameters from `db/course.ts:317`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/lesson-gating-staff.test.ts` — copy the mock setup from the existing `lesson-gating-level.test.ts`, adding `isCourseStaff`:

```ts
describe('course staff bypass', () => {
  it('bypasses every gate for a subject expert on their own course', async () => {
    m.getUserRoleNames.mockResolvedValue([]);
    m.isCourseStaff.mockResolvedValue(true);

    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });

    expect(result?.outOfTier).toBeNull();
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 7);
  });

  it('gates a subject expert normally on a course they do not staff', async () => {
    m.getUserRoleNames.mockResolvedValue([]);
    m.isCourseStaff.mockResolvedValue(false);
    m.getCurrentLevel.mockResolvedValue('intermediate');

    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });

    // basic-1 is levels:['basic'] — out of tier for an intermediate learner.
    expect(result?.outOfTier).not.toBeNull();
  });

  it('does not query staff for an admin — they bypass on role alone', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);

    await evaluateLessonGate({ userId: 'u1', lessonSlug: 'basic-1' });

    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });
});
```

The third test protects the hot path: an admin must not incur an extra query on every gated request.

- [ ] **Step 2: Run it, confirm it fails, implement**

At each site, short-circuit on `hasAdminAccess` first so the staff query only runs for non-admins:

```ts
const isAdmin = hasAdminAccess(roles);
const bypass = isAdmin || (await isCourseStaff(userId, course.courseId));
if (bypass) {
  return { ...course, isAdmin: true, subscribed: true, level: 'advanced',
           outOfTier: null, lessonLock: { kind: 'open' }, materialLock: { kind: 'open' } };
}
```

Note the existing field is called `isAdmin` and is used downstream to render `<AdminPreviewNote />`. Keep the field name and set it `true` for course staff too — an SME previewing their own course is in exactly the situation that note describes. Renaming it is a bigger change than this task should carry; add a comment saying the name now means "viewing as author".

`db/course.ts:317` is the awkward one: `bypassLocks` is computed once for a **list** of courses. Resolve the staffed course ids in one query rather than N — add `getStaffCourseIds(userId): Promise<Set<number>>` to `src/db/course-staff.ts` and test `bypassLocks || staffCourseIds.has(courseId)` per card.

- [ ] **Step 3: Prove each site**

Add a staff-bypass case to each existing suite: `library.server`, `news.server` (both sites), `course-content`, `course-resume-functions`, `details.ts`. Each asserts the bypass fires for staff and does not for a non-staff learner.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
git add src/lib src/db src/routes/api/course
git commit -m "feat(staff): staff view their own courses as authors"
```

---

# Phase 5 — Assignment surface

### Task 11: Staff assignment API

**Files:**
- Create: `src/routes/api/admin/courses.$courseId.staff.ts`, `src/routes/api/admin/__tests__/course-staff-route.test.ts`
- Modify: `src/lib/admin-schemas.ts` (input schema)

**Interfaces:**
- Consumes: `listCourseStaff`, `assignCourseStaff`, `removeCourseStaff`, `isAssignableCourseRole` (Task 2); `requireCoursePermission` (Task 5).
- Produces: `getCourseStaffHandler`, `putCourseStaffHandler`, `deleteCourseStaffHandler`, `setCourseStaffInputSchema`.

- [ ] **Step 1: Add the input schema**

```ts
export const setCourseStaffInputSchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(COURSE_SCOPED_ROLES),
  })
  .strict();
export type SetCourseStaffInput = z.infer<typeof setCourseStaffInputSchema>;
```

- [ ] **Step 2: Write the failing test**

`src/routes/api/admin/__tests__/course-staff-route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() { super('Forbidden'); this.name = 'ForbiddenError'; }
  }
  return {
    ForbiddenError,
    requireCoursePermission: vi.fn(),
    listCourseStaff: vi.fn(),
    assignCourseStaff: vi.fn(),
    removeCourseStaff: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError: m.ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/course-staff', () => ({
  listCourseStaff: m.listCourseStaff,
  assignCourseStaff: m.assignCourseStaff,
  removeCourseStaff: m.removeCourseStaff,
}));

import {
  deleteCourseStaffHandler,
  getCourseStaffHandler,
  putCourseStaffHandler,
} from '../courses.$courseId.staff';

const ADMIN = { userId: 'a1', roles: ['admin'], courseRoles: [], permissions: new Set<string>(), isOwner: false };
const SME = { userId: 's1', roles: [], courseRoles: ['subject-expert'], permissions: new Set<string>(), isOwner: false };

function req(body?: unknown, method = 'PUT'): Request {
  return new Request('http://t/x', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue(ADMIN);
  m.listCourseStaff.mockResolvedValue([]);
  m.assignCourseStaff.mockResolvedValue({ ok: true });
});

describe('PUT /api/admin/courses/:courseId/staff', () => {
  it('asks for staff:create on that course', async () => {
    await putCourseStaffHandler(req({ userId: 'u9', role: 'course-manager' }), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(), 7, 'staff', 'create',
    );
  });

  it('records the acting user as the assigner', async () => {
    await putCourseStaffHandler(req({ userId: 'u9', role: 'course-manager' }), '7');
    expect(m.assignCourseStaff).toHaveBeenCalledWith({
      userId: 'u9', courseId: 7, roleName: 'course-manager', assignedBy: 'a1',
    });
  });

  it('lets an admin assign a subject expert', async () => {
    const res = await putCourseStaffHandler(req({ userId: 'u9', role: 'subject-expert' }), '7');
    expect(res.status).toBe(204);
  });

  it('refuses an SME appointing another SME', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await putCourseStaffHandler(req({ userId: 'u9', role: 'subject-expert' }), '7');
    expect(res.status).toBe(403);
    expect(m.assignCourseStaff).not.toHaveBeenCalled();
  });

  it('lets an SME appoint a course manager', async () => {
    m.requireCoursePermission.mockResolvedValue(SME);
    const res = await putCourseStaffHandler(req({ userId: 'u9', role: 'course-manager' }), '7');
    expect(res.status).toBe(204);
    expect(m.assignCourseStaff).toHaveBeenCalled();
  });

  it('rejects a role that is not course-scoped', async () => {
    const res = await putCourseStaffHandler(req({ userId: 'u9', role: 'admin' }), '7');
    expect(res.status).toBe(400);
    expect(m.assignCourseStaff).not.toHaveBeenCalled();
  });

  it('403s when the guard refuses, before writing', async () => {
    m.requireCoursePermission.mockRejectedValue(new m.ForbiddenError());
    const res = await putCourseStaffHandler(req({ userId: 'u9', role: 'course-manager' }), '7');
    expect(res.status).toBe(403);
    expect(m.assignCourseStaff).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/courses/:courseId/staff', () => {
  it('asks for staff:delete and removes the assignment', async () => {
    await deleteCourseStaffHandler(req({ userId: 'u9', role: 'course-manager' }, 'DELETE'), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(), 7, 'staff', 'delete',
    );
    expect(m.removeCourseStaff).toHaveBeenCalledWith('u9', 7, 'course-manager');
  });
});

describe('GET /api/admin/courses/:courseId/staff', () => {
  it('asks for staff:read', async () => {
    await getCourseStaffHandler(req(undefined, 'GET'), '7');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(), 7, 'staff', 'read',
    );
  });
});
```

- [ ] **Step 3: Implement the route**

The self-propagation guard rail is the part that needs care:

```ts
/**
 * An SME may bring in an assistant, not appoint a peer.
 *
 * Without this, role assignment is self-propagating: a subject expert could
 * grant another person full authority over their subject with no admin
 * involvement, and the "admin hires professors" rule would hold only until the
 * first professor was hired.
 */
const isGlobalStaff = hasAdminAccess(actor.roles);
if (!isGlobalStaff && parsed.data.role === SUBJECT_EXPERT_ROLE) {
  return Response.json(
    { error: 'Only an admin or owner can appoint a subject expert.' },
    { status: 403 },
  );
}
```

- [ ] **Step 4: Run, prove the guard rail bites, commit**

Delete the self-propagation check, confirm the "refuses an SME appointing another SME" test goes RED, restore.

```bash
pnpm test src/routes/api/admin/__tests__/course-staff-route.test.ts && npx tsc --noEmit
git add src/routes/api/admin src/lib/admin-schemas.ts
git commit -m "feat(staff): course staff assignment API"
```

---

### Task 12: Staff panel in the course editor

**Files:**
- Create: `src/data-hooks/use-course-staff.ts`, `src/components/admin/course-staff-panel.tsx`
- Modify: `src/routes/_authed/admin.$courseId.editor.tsx` (add the panel), `src/data-hooks/keys.ts`

- [ ] **Step 1: Data hooks**

`useCourseStaff(courseId)` with `staleTime: 30_000`; `useAssignCourseStaff(courseId)` and `useRemoveCourseStaff(courseId)`, both invalidating `dataKeys.courseStaff(courseId)` on success. No optimistic updates — this file's siblings deliberately have none.

- [ ] **Step 2: Presentational panel**

`CourseStaffPanel` is pure and hookless. Props: `staff: CourseStaffMember[]`, `assignableRoles: string[]`, `canAssign: boolean`, `onAssign`, `onRemove`, `isSaving`, `error`. Render each member with `roleAcronym(role)` as a badge and their full name from `roleDisplayName` in the accessible name — an acronym alone is not a label a screen reader can use. Use Base UI `Select` for the role and `Combobox` for picking the person; semantic tokens only; logical properties only.

- [ ] **Step 3: Gate the panel**

Render it only when the actor holds `staff:read` on that course. The route context carries global permissions only, so the panel's visibility comes from the GET returning 200 vs 403 — render it optimistically and hide on a 403, matching how the editor already handles permission-shaped failures.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
git add src/data-hooks src/components/admin src/routes/_authed
git commit -m "feat(staff): assign course staff from the course editor"
```

---

# Phase 6 — Fixes carried by this work

### Task 13: The admin nav bug and the stale AI clause

**Files:**
- Modify: `src/components/admin/admin-shell-layout.tsx:29-39`, `src/ai/prompts/viper7.ts:114-124`
- Test: `src/components/admin/__tests__/admin-shell-layout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps the Courses link when the actor cannot see People', () => {
  render(<AdminShellLayout canSeePeople={false}>{null}</AdminShellLayout>);
  expect(screen.getByRole('link', { name: 'Courses' })).toBeDefined();
  expect(screen.queryByRole('link', { name: 'People' })).toBeNull();
});
```

- [ ] **Step 2: Move the condition**

`canSeePeople` currently gates the entire `<nav>`, so an admin without `user:read` — the default state, since `role_permissions` ships empty — loses the Courses link and the whole section nav. Move `{canSeePeople && …}` from the `<nav>` wrapper down onto the single People `AdminNavLink`.

This matters more after this feature: SMEs and course-managers reach `/admin` with no `user:read` at all.

- [ ] **Step 3: Delete the stale prompt clause**

`src/ai/prompts/viper7.ts:114-124` asserts *"The REVIEWER and SME roles have full prepaid access to the course and can ask any question."* None of `REVIEWER`/`SME`/`ASSOCIATE` is a role, and after this change the real role is `subject-expert`, so the clause can never match. Delete the `userRolesPrompt` block and its interpolation.

Access control by prompt is not access control — the gate enforces this in code. Leaving three sentences describing an access model that does not exist misinforms the next reader.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && pnpm test
git add src/components/admin src/ai/prompts
git commit -m "fix(admin): keep the Courses nav without user:read; drop the dead role clause"
```

---

## Self-review notes

**Spec coverage.** §1 roles → Task 1. §2 schema → Tasks 1–2. §3 entities and grid → Tasks 1 (seed grants), 4. §4 guards → Tasks 3, 5, 7, 8, 9. §5 assignment → Tasks 6, 11, 12. §6 learner side → Task 10. §7 AI prompt → Task 13. §8 tradeoffs are accepted, not implemented. §9 nav bug → Task 13. §9b rulings → Tasks 8 (config split), 9 (parser), 7 (credentials/persona left alone).

**Known gaps, deliberately left:**
- **The grid grants `structure`/`content` to roles that are only ever checked per-course.** An owner could tick `structure:update` for `admin` in the panel and grant admins authoring everywhere, silently undoing §3. The panel has no way to express "this entity is course-scoped". Simplest guard: render course-scoped entities as read-only in the grid with a note that they are granted by course assignment. Worth doing; not in a task because it needs a design decision on the panel.
- **`getMyCourses` (`db/course.ts:317`) resolves staff for a list of courses.** Task 10 Step 2 specifies a set-based lookup, but if that page is hot it deserves measuring.
- **`countRoleHolders` (`src/db/permissions.ts:146`) has no non-test caller** — `setUserRole` re-implements the count inside its transaction. Unrelated to this work; worth deleting separately.

**Natural split point:** Tasks 1–6 are a complete, testable authorization core — roles exist, the table exists, the guard works, nothing is wired. Tasks 7–13 are the surfaces. Stop after Task 6 if you want two passes; nothing in Phases 3–6 is a prerequisite for anything in Phases 1–2.
