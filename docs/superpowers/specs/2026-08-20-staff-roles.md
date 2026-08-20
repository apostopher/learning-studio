# Staff Roles — Spec

**Status:** Agreed 2026-08-20 via grilling session.
**Builds on:** `docs/superpowers/specs/2026-08-19-user-levels.md` (per-course pilot levels).

"Staff" is **not a role**. It is an umbrella over four roles in two tiers of scope.
A student is any enrolled user. **Staff are also students** — meaningfully so,
because a Biology SME opening the Computer Science course is a fully gated learner
there.

---

## 1. The roles

| stored `name` | display | acronym | scope |
|---|---|---|---|
| `owner` | Org Owner | OWNER | org |
| `admin` | Org Admin | ADMIN | org |
| `subject-expert` | Subject Expert | SME | **per course** |
| `course-manager` | Course Manager | CRS-MGR | **per course** |

The mental model is a university. The org is the university. Owners are trustees;
admins are senior staff who hire professors; an SME is a professor, master of one
subject; a course-manager is their assistant. **A Biology SME cannot teach Computer
Science** — that sentence is the reason scoping exists.

**One deployment is one university.** `ACTIVE_ORG_ID` stays; there is no
multi-tenancy work here. "Org level" therefore means *global* in code.

Labels live in a `ROLE_LABELS` map in code carrying `{ name, acronym }`, beside the
existing `LEVEL_LABELS` and `ENTITY_LABELS`. **No new columns on `user_roles`** —
the set of roles is closed, because every guard compares literal role names. A role
row the code does not know would appear in the grid, accept grants, and do nothing.

---

## 2. Schema

`user_profile_roles` is **unchanged** and keeps meaning *global role*.

One new table:

```
course_staff (
  user_id     varchar(255) -> user_profiles.user_id  (cascade)
  course_id   integer      -> courses.id             (cascade)
  role_id     integer      -> user_roles.id          (restrict)
  assigned_by varchar(255)                            -- plain id, outlives the account
  created_at  timestamp
)
unique (user_id, course_id, role_id)
```

`subject-expert` and `course-manager` are seeded by an idempotent insert in the
migration, exactly as `owner` was created in `migrate-user-management.ts`
(`on conflict (name) do nothing`).

---

## 3. Permission model

Three new entities beside the existing `user` / `enrolment` / `level`:

- **`course`** — *org-level*. Creating and deleting courses.
- **`structure`** — *per-course*. Modules, lessons, ordering, dependencies,
  `isAvailable`, **and the lesson `levels` tag**.
- **`content`** — *per-course*. Lesson material, video, quiz, debrief.
- **`staff`** — *per-course*. Assigning course staff.

| | user | enrolment | level | course | structure | content | staff |
|---|---|---|---|---|---|---|---|
| **owner** | `*` — everything, everywhere |
| **admin** | ✓ | ✓ | ✓ | CRUD | — | — | CRD (any course) |
| **SME** | — | — | — | — | CRUD | CRUD | CRD (own courses, CRS-MGR only) |
| **course-manager** | — | — | — | — | CRUD | read | — |

**Admin is a jack of all trades and master of none.** They create courses, hire
staff, manage enrolment and pilot levels — and **cannot author**. To edit a course
an admin assigns themselves as an SME, which is a visible act recorded in
`course_staff.assigned_by`.

**SME is the master of one.** Full authority inside their courses, none outside.
SME is a superset of course-manager: a professor can build their own scaffolding,
so they are never blocked on an assistant being available.

**Owner keeps `*`.** The owner short-circuit in `getUserPermissions`,
`requirePermission`, `requireOwner` and `assertCanActOnProfile` is load-bearing and
stays. Owners not authoring is a convention, not a constraint.

---

## 4. Guards

`requirePermission` keeps its **admin floor** for org-level entities
(`user`, `enrolment`, `level`, `course`).

A new **`requireCoursePermission(headers, courseId, entity, action)`** handles the
per-course entities (`structure`, `content`, `staff`): resolve the actor's global
roles **and** their roles on that course, union the grants, then check. Routes keyed
on a lesson or module id resolve upward to the course first.

**Corrected against the code (2026-08-20).** There are **25** `requireAdmin` route
files, not 32. Only the course-scoped ones convert:

| group | count | disposition |
|---|---|---|
| already holds a `courseId` | 10 | convert to `requireCoursePermission` |
| holds a `moduleId`/`lessonId` | 6 | resolve upward, then convert |
| org-level, not course-owned (personas ×5, uploads, ai-rag) | 7 | **stay on `requireAdmin`** |
| genuinely global (`courses.ts` list/create) | 1 | convert to `requirePermission('course', …)` |
| `lesson-material.parse.ts` — no identifier at all | 1 | see below |

Personas, blob uploads and the RAG corpus are org-level AI/infrastructure config,
not course content. They are not `course`, `structure`, `content` or `staff`, so
they keep `requireAdmin`. This is not the "two guard styles on one surface" we
rejected in Q3 — it is a different surface.

**Two helpers do not exist and must be written**: everything in `src/db/lesson-access.ts`
resolves lesson/module → course **slug**, never id (`getCourseSlugForLessonId`,
`getCourseSlugForModuleId`). The conversion needs `getCourseIdForLessonId` and
`getCourseIdForModuleId`.

**The permission grid needs no course axis.** Grants stay per-role
(`SME → structure:*`); the *course* dimension lives entirely in `course_staff`.
`RolePermissionsPanel` keeps its flat role × entity × action shape.

---

## 5. Assignment rules

- **Owner** changes anyone's roles **except another owner's**.
- **Admin** assigns `subject-expert` and `course-manager` on any course.
- **SME** assigns a `course-manager` on their own courses, and **cannot appoint
  another SME** — otherwise role assignment becomes self-propagating and a
  professor could grant a peer full authority over their subject with no admin
  involvement.
- `assertCanActOnProfile` **relaxes**: only a **global** role makes someone
  owner-only-manageable. A course-scoped role does not — otherwise admins could not
  enrol, level or fix the profiles of the professors they hire, and the *student*
  half of a staff account becomes unadministrable.

---

## 6. The learner side

Staff **view as authors and bypass all gates — but only where they hold
authority.**

- Owner and admin bypass everywhere (org-level authority).
- SME and course-manager bypass **only their assigned courses**, and are ordinary
  gated students everywhere else — enrolment, pilot level, prerequisites all
  enforced.

The bypass check becomes `hasAdminAccess(roles) || isCourseStaff(userId, courseId)`.

**Corrected: there are eight sites, not seven** —
`lesson-gating.server.ts:99`, `db/course.ts:317`, `course-resume-functions.ts:61`,
`db/course-content.ts:146`, `library.server.ts:46`, `news.server.ts:47`,
`news.server.ts:105`, and `routes/api/course/details.ts:62`.
`course-card-resume.ts` calls nothing itself — it receives `bypassLocks` and
`level` as parameters from `db/course.ts`, so migrating that site carries it.

**Rejected: a global staff bypass.** A course-manager assigned to one course would
gain unfiltered read access to the entire catalogue, contradicting "a Biology SME
cannot teach Computer Science" at the only moment it matters — and it would make
"staff are also students" decorative, since no staff member would ever experience
any course as a learner.

**Rejected: a "view as learner" toggle.** Staff view as authors, full stop.

---

## 7. AI prompt

`src/ai/prompts/viper7.ts:114-124` builds a block from the user's real roles and
asserts that *"The REVIEWER and SME roles have full prepaid access to the course
and can ask any question."* It is fed live by `getUserRoleNames`. None of
`REVIEWER` / `SME` / `ASSOCIATE` has ever been a role.

Naming the role **`subject-expert`** keeps that clause dormant. The dead clause is
**deleted anyway** — after the rename it can never match, so it is three sentences
misdescribing an access model that does not exist.

Pitching chat responses differently for staff is real future work with its own
evaluation. It is **not** part of this change.

---

## 8. Accepted tradeoffs

1. **A course-manager can silently hide a lesson from an entire cohort** — the
   `levels` tag sits under `structure`, and exact-match visibility hides rather
   than locks.
2. **A rogue or departed owner needs direct database access to remove.** Owners are
   mutually untouchable; only an owner can demote themselves, and the last owner
   cannot be removed at all.
3. **A role row without code support does nothing.** The set is closed; adding one
   is a PR, not a UI action.
4. **Admin cannot author without self-assigning** as an SME — two clicks, and an
   audit record.

---

## 9. Pre-existing bug fixed in the same pass

`src/components/admin/admin-shell-layout.tsx:29` hides the **entire** admin nav —
the Courses link included, not just People — unless the actor holds `user:read`.
Since `role_permissions` ships deliberately empty, **every non-owner admin
currently sees a nav-less shell.** This work makes it far more visible, because
SMEs and course-managers will reach `/admin` with no `user:read` at all.

---

## 9b. Rulings made while planning, from facts the grilling session did not have

1. **`updateLessonConfigInputSchema` straddles both entities.** One `.strict()`
   schema and one `updateLessonConfig` call carry `isAvailable`, `levels`,
   `requiredSubscriptions` (**structure**) alongside `hasDebrief`,
   `needsVideoWatch` (**content**). Ruling: check **per field group inside the
   handler** — a body touching structure fields requires `structure:update`, one
   touching content fields requires `content:update`, a body touching both
   requires both. The client sends one field at a time, so mixed bodies are
   theoretical. Splitting the route would fork `useUpdateLessonConfig` for no gain.
2. **`lesson-material.parse.ts` has no identifier of any kind** — multipart file
   in, generated material out, nothing persisted. Ruling: guard on *holds
   `content:create` on **any** course* rather than inventing a `courseId` the
   client does not have. It writes nothing.
3. **Course credentials stay `requireAdmin`.** `courses.$courseId.credentials*`
   holds video-provider **secrets**. Course-scoped, but an SME authoring lessons
   has no business reading deployment credentials.
4. **News sources map to `content`.** `courses.$courseId.news-sources*` is
   per-course material curation.
5. **`courses.$courseId.persona` stays `requireAdmin`** — it pins an org-level AI
   persona to a course; the persona itself is org config.

---

## 10. Conventions this must follow

- `text` + const-tuple → `z.enum`, never `pgEnum`.
- PKs are `integer().primaryKey().generatedAlwaysAsIdentity()`.
- Timestamps are `timestamp('col', { mode: 'date' })`.
- Migrations are hand-written idempotent SQL run via `tsx`, never `db:push`.
- Tests assert on **what the consumer received**.
- Guards self-guard and throw `ForbiddenError`; handlers map it to 403.
- A permission entity is never folded into an existing one — that grants power
  silently to everyone who already holds it.
