# Shared understanding: user management

## Goal

Give the product an `owner` (superuser, granted by hand) who can enrol people
on courses and delegate that day-to-day work to `admin`s, so the owner isn't
the bottleneck. Delegation is governed by permissions expressed as
entity × action.

Splits into **two shipments**, because the first is a live bug fix that needs
none of the second's machinery and shouldn't wait for it.

---

## Current state (verified, not assumed)

| Fact | Evidence |
| --- | --- |
| `user_roles` + `user_profile_roles` join already exist, with an `assignedBy` audit column | `src/db/schema.ts:610,636` |
| `assignedBy` is written **only** as the literal `'seed'` and has **zero read sites** | `src/db/seed-admin.ts:67`, repo-wide grep |
| Exactly **one** role exists: `admin` (id 1), held by **2 users** | live DB, 2026-08-06 |
| `requireAdmin` is a binary `roles.includes('admin')`, called from **34 route files** | `src/lib/admin-functions.server.ts:13` |
| `/admin` gates on the same check in `beforeLoad` | `src/routes/_authed/admin.tsx:6` |
| Roles reach the client via `getAuthContext` → router context | `src/lib/auth-functions.ts:29`, `src/routes/__root.tsx:24` |
| `course_subscriptions (userId, courseId)` is already the entitlement table; `lesson-access.ts` treats row existence as the whole answer | `schema.ts:911`, `src/db/lesson-access.ts:91` |
| Auth is **email-OTP only** — no passwords, no social, no admin-created accounts | `src/lib/auth.ts` |
| **Nothing creates `user_profiles` rows** — only `seed-admin.ts`, by hand | repo-wide grep for `insert(userProfileTable)` |
| **13 tables** FK to `user_profiles.user_id` | `information_schema` query |
| Live counts: 2 auth users, 2 profiles, **0 orphans**, 2 subscriptions | live DB |
| OTP signup stores `name: ""` and `image: null` | live DB `user` rows |
| `associateNumber` and `associate_counters` are **entirely unused** — nothing generates them | repo-wide grep |
| `account_deletion_requests` exists with **zero read sites** | repo-wide grep |
| `userOrgTable.userRoles` (varchar array) is a second, **unused** role mechanism | repo-wide grep |
| No users admin UI, no `/api/admin/users*` route, no permissions table | filesystem |

---

## Ship 1 — profile creation on sign-in (standalone, first)

### The bug

A new signup gets an auth `user` row and **no `user_profiles` row**. Thirteen
tables have a foreign key onto `user_profiles.user_id`:

```
course_subscriptions   ai_chats              lesson_material_progress
videos_progress        lesson_quiz_answers   lesson_test_results
course_onboarding      user_ska_profile      fav_key_points
course_last_viewed     user_news_sources     user_organizations
account_deletion_requests
```

So the account is not merely course-less — **every write it attempts violates a
foreign key**. Chatting, watching a video, answering a quiz and onboarding all
fail. It is invisible today only because the sole two accounts were seeded by
hand (0 orphans).

### The fix

| # | Decision | Chosen | Rationale |
| --- | --- | --- | --- |
| 1 | Where profile creation happens | better-auth `databaseHooks.user.create.after` | Fires exactly once at account creation, costs nothing per request, and fixes the bug at its source. |
| 2 | What the profile is seeded with | `userId` + `email` only | Nothing else is derivable: OTP signup writes `name: ""` and `image: null`. Matches the two existing seeded profiles exactly. |
| 3 | `associateNumber` at signup | **Not assigned** | The column and its counter table have no generator and no reader. Inventing a value here would be shipping an unrequested feature inside a bug fix. |
| 4 | Hook failure | Hook **plus** an idempotent ensure-profile in `getAuthContext` | The hook is not transactional with the `user` row. If the insert throws, the account is already committed, `email` is `unique` so they cannot sign up again, and the `after` hook never re-fires — leaving them permanently broken with no UI recovery. The guarded upsert no-ops once the row exists. |
| 5 | Ship order | **Before** user management | Needs no roles, permissions or `pending_enrolments`. Any real learner can use the app the day it lands instead of waiting on the RBAC build, and it is far easier to review alone. |

### Test

Assert the row `user_profiles` actually received after account creation — not
that the hook returned. Plus: a second sign-in does not duplicate the row, and
an account that somehow lacks a profile gains one on its next authenticated
request.

---

## Ship 2 — owner, admins, permissions

### Decisions

| # | Decision | Chosen | Rationale |
| --- | --- | --- | --- |
| 6 | What `admin` means now | **Same role**, gains user management | It already gates 34 content routes and 2 people hold it. Redefining it would re-gate all 34 and demote both. `owner` sits above as the only role-granter. |
| 7 | How `owner` is represented | A row in `user_roles`; a shared `hasAdminAccess(roles)` widens `requireAdmin` and `/admin`'s `beforeLoad` to admin-**or**-owner | One place to change, 34 routes untouched, one role row per owner. Giving owners a duplicate `admin` row would put the invariant in data, where revoking `admin` silently strips content access from someone still reading as owner. |
| 8 | Grant target | **Roles**: `role_permissions(roleId, entity, action)` | Every admin is identical, so "what can an admin do" has one answer. Per-user overrides can be layered later as a second table unioned at check time — additive, so this is the reversible choice. |
| 9 | Entities | `user` and `enrolment` | Enrolment is the primary delegated task and account deletion the most dangerous thing nearby; keeping them separable means `enrolment:create` can be granted without `user:delete`. |
| 10 | Which actions exist | `user`: read, create (= invite), update. `enrolment`: create, read, delete | Only actions with endpoints. `user:delete` is deferred (#11) and `enrolment:update` is meaningless — a subscription row has no editable fields. A checkbox nothing enforces is the dead-field rule at the permission layer. |
| 11 | `user:delete` | **Deferred** | It is the most destructive operation in the app; shipping it in the same change as the permission system that guards it is the wrong order. |
| 12 | Role assignment | **Owner-only, hardcoded** — never a grantable permission; `user:update` explicitly excludes roles | This is the containment boundary. If roles were grantable, an admin holding that permission could promote themselves to owner and the hierarchy would be decorative. |
| 13 | Who a permission applies to | Only users holding **no** role; acting on an admin or owner requires owner | Otherwise `user:update` lets an admin rewrite a privileged account's record. |
| 14 | Last owner | Removal **refused**, checked inside the same transaction as the count | Role assignment is owner-only, so zero owners means nobody can ever grant a role again — recoverable only from a terminal with DB access. |
| 15 | Editable profile fields | Everything **except** `email` and `associateNumber` | `email` would desync from the auth record that actually governs sign-in (they are separate columns in separate tables, and nothing syncs them). `associateNumber` is counter-generated and unique. |
| 16 | Pre-assignment storage | `pending_enrolments(email, courseId, addedBy, addedAt)`, one row per pair | Mirrors `course_subscriptions`, so the claim step is a straight copy. Adding a second course is another row and removing one is a row delete — no array to rewrite. Unique on `(email, courseId)`. |
| 17 | Invite notification | **None sent** | The admin records the email and courses; the person is simply ready when they next log in. |
| 18 | Claim on first sign-in | The Ship-1 hook grows a step: copy matching `pending_enrolments` into `course_subscriptions`, stamp claimed — same transaction as profile creation | One well-defined moment, and the profile must exist first anyway (the FK depends on it). |
| 19 | Uninvited sign-in | Profile created, no courses, empty state | The app already renders zero subscriptions, and the person shows up in the users list for an admin to enrol. Refusing sign-in is a separate security posture that can be layered later. |
| 20 | Unassigning a course | Remove the entitlement row **only** — progress, onboarding and SKA profile survive | Unassigning is an access decision, not a request to erase someone's work; the destructive version is unrecoverable, and re-assigning should resume where they were. |
| 21 | Server enforcement | `requirePermission(headers, entity, action)`, throwing the existing `ForbiddenError` | Mirrors `requireAdmin`, so each route's existing `guard()` barely changes and every handler self-guards. Returning a permission set for callers to check invites a handler that forgets to look — the exact failure guards exist to prevent. |
| 22 | Client permissions | Added to `getAuthContext` → router context | It already resolves roles on that request; permissions is one more join. Available in `beforeLoad`, so `/admin/users` can redirect without a flash of unusable page. |
| 23 | Missing-permission presentation | **Hidden**; page-level redirect | A control that can never be enabled is absence, not a locked state, so there is nothing to explain and nothing teased. |
| 24 | Users UI | `/admin/users`: one TanStack Table of real **and** pending people, pending badged; `nuqs` search; row-modal for profile + courses + owner-only role toggles | One list answers "who is expected on this course"; splitting active from pending means looking in two places and watching rows migrate between them. |
| 25 | Permission-matrix UI | Owner-only "Roles & permissions" panel on `/admin/users` | Delegation lives where the people are. `owner` is **not** listed — it bypasses checks, so granting it permissions would be a control that does nothing. |
| 26 | Audit | Populate and display `assignedBy`; add `addedBy`/`addedAt` to pending enrolments and an actor column to `course_subscriptions` | Turns a dead column into a read one and answers "who gave this person access" without a new subsystem. |
| 27 | Bootstrap | `pnpm db:grant-role <email> <role>` generalises `db:grant-admin` (alias kept); owner granted by hand; the 2 existing admins unchanged | Nothing changes underneath anyone silently — `role_permissions` starts empty for `admin`, so today's admins keep exactly what they have until the owner grants deliberately. |

### Schema changes

```
user_roles
  + row 'owner'

role_permissions (new)
    roleId  → user_roles.id   onDelete: cascade
    entity  text     -- 'user' | 'enrolment'
    action  text     -- 'create' | 'read' | 'update' | 'delete'
    uniqueIndex(role_id, entity, action)

pending_enrolments (new)
    id        identity pk
    email     text notNull
    courseId  → courses.id  onDelete: cascade
    addedBy   text          -- acting user's id
    addedAt   timestamp notNull default now()
    claimedAt timestamp     -- null until first sign-in
    uniqueIndex(email, course_id) · index(email)

course_subscriptions
  + grantedBy text          -- acting admin/owner, null for self-serve

user_profile_roles
  ~ assignedBy now populated with the acting owner's id and read by the UI
```

Migrated by hand (`src/db/migrate-*.ts`), **not** `drizzle-kit push` — see
[[db-push-wants-to-truncate-docs]]: push offers to truncate `docs` (6917
embedding rows) over unrelated drift.

### Permission resolution

```
requirePermission(headers, entity, action)
  └─ roles = getUserRoleNames(userId)
  └─ roles includes 'owner'            → allow (bypass)
  └─ role_permissions has (role, entity, action) → allow
  └─ otherwise                          → ForbiddenError (403)

target guard (user entity only)
  └─ target holds any role and actor is not owner → ForbiddenError
```

---

## Failure behaviour

| Scenario | What happens | User sees |
| --- | --- | --- |
| Profile insert fails in the hook | Account exists without a profile; repaired by the ensure-profile on the next authenticated request | Nothing — one page load later they are normal |
| Uninvited person signs in | Profile created, no enrolments | "No courses yet" empty state |
| Invited person signs in | Profile + all pending courses applied, rows stamped claimed | Their courses are already there |
| Same email pre-added twice for one course | Unique index makes the second a no-op | "Already added" on the form |
| Admin without the permission calls the API directly | 403 from `requirePermission` | — (the control was hidden) |
| Admin tries to act on an admin or owner | 403 from the target guard | Row shows no actions for privileged users |
| Owner removes the last owner | Refused inside the counting transaction | "The last owner can't be removed — promote someone else first" |
| Admin tries to grant a role | Endpoint is owner-only; 403 | Role toggles are not rendered for admins |
| Course unassigned then re-assigned | Progress, onboarding and SKA profile intact | Resumes where they left off |
| Person pre-added but never signs in | `pending_enrolments` row sits unclaimed | Listed as "Pending first sign-in" indefinitely |

---

## Accepted risks

- **Ensure-profile on the hot path.** One guarded upsert per authenticated
  request. Bounded, and the alternative failure is unrecoverable without DB
  access.
- **All admins are equal.** No per-admin variation until per-user overrides are
  added; revoking a permission revokes it for every admin at once.
- **Pending rows are unbounded.** Nothing expires an email that never signs in.
- **`grantedBy` is a plain id, not an FK.** The actor may later be deleted; the
  audit string outlives them deliberately.
- **No history.** Per-row actor columns answer "who granted this", never "what
  was revoked and when". A full audit log is out of scope.
- **Pre-added emails are unverified.** Anyone who can receive mail at that
  address inherits the enrolments. Same trust model as OTP itself.

---

## Assumed (not confirmed)

- Table names `role_permissions` and `pending_enrolments`; helper at
  `src/lib/permissions.server.ts` alongside `admin-functions.server.ts`.
- `entity`/`action` stored as text with zod enums at the edge, rather than
  Postgres enums — a new entity should not need a migration.
- Route files `api/admin/users.ts`, `users.$userId.ts`,
  `users.$userId.enrolments.ts`, `roles.ts`, `role-permissions.ts`, each
  self-guarding per [[admin-api-guarding]].
- The users list is unpaginated for now (2 users); `nuqs` search only.
- A user may hold several roles; `owner` short-circuits, so combinations are
  harmless.
- Presentational components stay hookless and prop-driven, per the repo's
  render-test constraint.

---

## Out of scope

- `user:delete` and any account-deletion flow (`account_deletion_requests` stays
  the dead table it is today).
- Course-scoped permissions (an admin limited to one course's learners).
- Per-user permission overrides.
- A full `admin_audit_log`.
- Allow-list sign-in (refusing uninvited emails).
- Removing the dead `userOrgTable.userRoles` column — worth doing, separately.
- Email notification on invite.

---

## Open

- Exact copy for the last-owner refusal and the pending badge.
- Whether the users table needs server pagination, and at what size.
- Whether an owner should be able to see *why* an admin was denied something
  (a "permissions" column on the users list), or whether the grid is enough.
