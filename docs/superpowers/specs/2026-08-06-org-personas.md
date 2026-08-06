# Shared understanding: org personas

## Goal

Bring the old repo's persona-tuning admin (`airmanship-web/src/app/admin/viper7`)
into rmtp-studio, as a **Persona** section inside the existing AI Training
modal — which grows a sidebar like the course-edit modal.

Personas are **org-level**: any course can author one, every course in the org
sees it, and each course picks which one its chat uses. Today exactly one
persona is reachable at all, by a hardcoded name lookup, so the feature is
equally about making persona selection real as about the UI.

## Current state (verified, not assumed)

| Fact | Evidence |
| --- | --- |
| `personaTable` exists: `id`, `name` (globally unique), `content` jsonb, timestamps. No org or course scoping. | `src/db/schema.ts:1402` |
| Chat loads the persona by literal name | `src/routes/api/chat.ts:70` — `getPersona('viper7')` |
| The prompt reads 6 fields with per-field `\|\|` fallbacks | `src/ai/prompts/viper7.ts:256,265,272,294,318,398` |
| `persona.quotes` is **written and never read** — the prompt injects the hardcoded const | `viper7.ts:313` vs `src/db/seed-persona.ts:39` |
| `noAnswerTemplate` has **zero read sites** anywhere | repo-wide grep |
| `viper7.ts` via `chat.ts` is the **only** persona consumer (`onboarding.ts` matches are the word "personal") | repo-wide grep |
| "AI training" modal is single-column, 720px, course-scoped | `src/components/admin/course-embeddings-dialog-container.tsx` → `course-embeddings-modal.tsx` |
| `course-embeddings-modal.tsx` has exactly **one** consumer | repo-wide grep |
| The course-edit sidebar shell is already generic and reusable | `src/components/admin/sectioned-config-modal.tsx` (`sections[]`, vertical Base UI `Tabs`, 1280px) |
| Shared by lesson-config and edit-course dialogs | `lesson-config-dialog-container.tsx:53`, `edit-course-dialog-container.tsx:141` |
| The shell wraps **all** panels in one `ScrollArea`, whose `Content` sizes to content | `sectioned-config-modal.tsx:88` |
| `courses` has **no** `orgId`; `organization_lessons` attaches *lessons* to orgs, and `getCourseDetails` left-joins it — so a course is currently **shared**, not owned | `schema.ts:39`, `src/db/course.ts:98` |
| `requireAdmin` returns `{ userId, roles }` — no org | `src/lib/admin-functions.server.ts:13` |
| `motion@12.38.0` already a dependency, used in ~10 components | `package.json:76` |
| Live data: **1 org** (`id 1`, "ITPS"), **1 persona** (`id 1`, "viper7"), **1 course** (`id 2`, "ITPS UAS Remote") | DB query, 2026-08-06 |

## Decisions

| # | Decision | Chosen | Rationale |
| --- | --- | --- | --- |
| 1 | What selects a persona at runtime | The course picks one | Otherwise every persona but `viper7` is a dead row — authored and never read. |
| 2 | Persona scoping | `personaTable.orgId`, notNull FK | Org-level is the stated model; make it a column rather than a convention. |
| 3 | Where `orgId` comes from | Courses become org-linked too | Without a course→org edge the column constrains authoring but nothing at read time — the dead-field pattern one level up. |
| 4 | Course↔org shape | **Many-to-many** `course_orgs` join table; the active org comes from an env var set by hand | An org has many courses and a course can belong to many orgs. Preserves the shared-course model that `organization_lessons` already implies. |
| 5 | Where the persona selection lives | On the `course_orgs` **join row** (`personaId` nullable) | With both sides many-to-many, "which persona does this course use" has no single answer at course level. On the join row, a selection can never point outside its own org — scoping is enforced by construction, not by a check. |
| 6 | Active-org env var | `ACTIVE_ORG_ID`, server-only, parsed once, **throws** if unset/invalid | A silent fallback to "first org" would attach personas to the wrong org with no signal. Identity ids differ per DB, so the value is set per environment anyway. |
| 7 | Fallback chain | `course_orgs.personaId` → `orgs.defaultPersonaId` → `undefined` (prompt defaults) | A chat with no `courseSlug` has no join row, so without an org default it could never use an authored persona. |
| 8 | Modal shell | Adopt `SectionedConfigModal`; **delete** `course-embeddings-modal.tsx` | The sidebar shell already exists and takes `sections[]`. Its only other consumer is the section being replaced. |
| 9 | Sections | **Training documents** (moved verbatim) + **Persona** | Sessions and test-chat are separate features with their own APIs; folding them in makes this unreviewable. |
| 10 | Persona section layout | Single tab, list ↔ editor as a **2-screen carousel** | User-specified. Both panes stay mounted, so no `AnimatePresence` — no stale-`custom` direction bug, no `popLayout` height snap, and the editor's form state survives the slide for free. |
| 11 | Carousel height | Both panes fill the modal viewport and scroll internally | Nothing to animate; the steadiest option with panes of wildly different heights. |
| 12 | How the shell allows that | Opt-in `fill?: boolean` on `ConfigModalSection` | A fill panel renders outside the shell's `ScrollArea` and owns its scrolling. No existing section sets the flag, so lesson-config and edit-course are byte-identical. |
| 13 | Editor fields | 6 plain auto-grow textareas + a quotes list | The prompt interpolates these raw. A rich-text editor would put HTML tags into the system prompt, or require a strip step with a real failure mode. |
| 14 | Dead fields | Wire `quotes` live (`persona.quotes` when non-empty, else the const); **remove** `noAnswerTemplate` | Quotes are a genuine persona trait and were already being stored. `noAnswerTemplate` has no reader and no plan for one. |
| 15 | Creation / validation | Only `name` required; content fields may be blank | A blank field falls back to the prompt default, so a half-written persona is still usable. The editor labels each empty field "using default". |
| 16 | Saving | **Autosave**, 800ms debounce, max-wait ~5s | User-specified. Flushes immediately on field blur, persona switch, Done, and modal close. |
| 17 | Crash/tab-close safety | `sendBeacon` on `pagehide` and `visibilitychange → hidden` | User-specified. Beacon is POST-only with no custom headers and no readable response — hence #19. |
| 18 | Live-edit exposure | **Draft column.** Autosave writes `draftContent`; chats read `content` only; explicit **Publish** copies across | Persona 1 is live for course 2 — without staging, a half-typed field is in production system prompts one debounce tick later. |
| 19 | Autosave transport | One `POST /personas/$id/draft` with two callers: `fetch` normally, `sendBeacon` for the last-gasp flush | Beacon can't report failure. If every save went that way, "Saved" could only ever mean "queued". |
| 20 | Publish mechanics | `draftContent` → `content`, then `draftContent = NULL` | "Has unpublished changes" collapses to `draftContent IS NOT NULL` — one predicate driving the badge, the button state, and the header. Autosave only writes a draft when the form differs from `content`, so publishing doesn't re-dirty. |
| 21 | Editor header | **Publish** (primary) + **Done** | Leaving mid-edit without pushing to production is the whole point of #18; a single button that does both defeats it. Done flushes, then reverses the carousel. |
| 22 | Name field | Live, saved on blur via `PATCH`, never via beacon; 409 shown inline | `name` is a column the prompt never reads — a label, not content, so there's nothing to stage. A collision must be reportable, which the beacon path can't do. |
| 23 | Name uniqueness | `uniqueIndex(org_id, name)`, replacing the global unique | Two orgs must both be able to have a "Viper7". `getPersona(name)` is deleted in favour of id lookups. |
| 24 | Unpublished personas | **Cannot** be assigned to a course or set as org default; control disabled with the reason visible and in its accessible name | Assigning an empty persona silently yields the built-in defaults — indistinguishable from a bug. |
| 25 | Deletion | Confirm names the affected courses and whether it's the org default; FKs are `onDelete: 'set null'` | A course quietly reverting to hardcoded defaults is a consequence the operator should have been told about. |
| 26 | New courses | Auto-insert `course_orgs(newId, ACTIVE_ORG_ID)` on creation | "Active org" is the org being administered. Otherwise a new course opens the Persona tab with nowhere to store a selection. |
| 27 | Bootstrap | Idempotent seed script, run between two halves of a hand-written migration script — **not** `db:push` | One command to stand up any environment. `push` was abandoned mid-migration: see "Deviations". |
| 28 | What bootstrap sets | `orgs.defaultPersonaId = 1` **and** `course_orgs(2,1).personaId = 1` | Explicit at both levels. **Consequence:** course 2 carries an override, so later org-default changes won't reach it until the course selection is cleared — the UI labels "override" vs "org default" so this is visible. |
| 29 | API | Six focused routes, one table each | Matches the repo's existing handler granularity (`courses.$courseId.news-sources.ts` et al). |
| 30 | Tests | Consumer-side assertions on the resolution chain, prompt, and route guards | Per CLAUDE.md: assert what `buildChatStream` *received*, not what the DB returned. |

## Deviations from the agreed design

Both forced by things only discovered while building. Neither changes behaviour.

**1. The org default is `personas.isOrgDefault`, not `orgs.defaultPersonaId`.**
A FK each way makes `organizations` ⇄ `personas` mutually referential, which
TypeScript cannot infer through — `TS7022` on both tables, plus `TS7024` on
their relation callbacks. As a boolean with a partial unique index
(`uniqueIndex(org_id) WHERE is_org_default`), the database still enforces "at
most one default per org", and it removes a failure mode the FK had: deleting a
persona takes the default with the row, so a dangling default id is
unrepresentable. Setting a default runs in a transaction — clear the old, set
the new — because the partial index rejects two defaults mid-statement.

**2. Migrated with a hand-written script, not `drizzle-kit push`.**
`push` diffs the entire schema, and this database has pre-existing drift with
nothing to do with personas: it wants to add `uniq_course_source_heading_chunk`
to `docs` and offers to **truncate that table (6917 embedding rows)** to do it.
Getting three columns and a join table is not worth answering that prompt, so
`src/db/migrate-org-personas.ts` issues only the statements this change needs.
Every one is `IF NOT EXISTS`/`IF EXISTS`, so it is re-runnable and safe.

**That `docs` drift is still outstanding** and will confront the next person who
runs `db:push` for any reason.

**3. No "use the organisation default" row in the persona list** (changed after
first look, 2026-08-06). It read as two competing selections next to the row
that already carries the `Org default` badge. The list now checks the persona
the course is *effectively* using — its own pin, else the org default — so a
never-configured course doesn't render with nothing selected while its chats
are already using a persona.

*Consequence:* there is no longer a UI path to **un-pin** a course back to
inheriting, so any course whose persona is touched carries an explicit
selection from then on. `course_orgs.personaId` still legitimately holds NULL
(that is how `linkCourseToOrg` creates a row, and `resolvePersonaForChat`
reads it), and `PUT /courses/:id/persona` still accepts `null` — only the UI
stopped offering it.

**4. Selection and org-default writes are optimistic.** Both controls render
from server state, so without it the radio and star only moved after a PUT
*and* a refetch had landed — reported as "significant lag". `onMutate` writes
the predicted state, `onError` rolls back (so a rejected unpublished-persona
write can't leave the radio lying), `onSettled` invalidates.

## Schema changes

```
personaTable
  + orgId         integer notNull → organizations.id  onDelete: cascade
  + draftContent  jsonb nullable  (PersonaSchema)
  + isOrgDefault  boolean notNull default false
  ~ name          drop global unique → uniqueIndex(org_id, name)
  ~ content       PersonaSchema loses noAnswerTemplate
  indexes: personas_org_name_idx (unique), personas_org_id_idx,
           personas_org_default_idx (unique, WHERE is_org_default)

course_orgs (new)
    id        identity pk
    courseId  → courses.id         onDelete: cascade
    orgId     → organizations.id   onDelete: cascade
    personaId → personas.id        onDelete: set null   (nullable)
    uniqueIndex(course_id, org_id) · index(org_id) · index(persona_id)
```

Migration sequence (`drizzle/` is stale — never `drizzle-kit generate`):

1. `pnpm db:migrate-org-personas` — columns, indexes, `course_orgs`;
   `org_id` arrives nullable
2. `pnpm db:seed-org-links` — stamps `org_id` on every persona lacking one,
   inserts a `course_orgs` row per course (`onConflictDoNothing`), sets
   `is_org_default` and each course's `personaId` to the org's first persona
3. `pnpm db:migrate-org-personas --finish` — `org_id` → `NOT NULL`

**Applied to the live database on 2026-08-06** and verified in place: `org_id`
NOT NULL, all eight indexes present, the old global `personas_name_unique`
dropped, persona 1 → org 1 with `is_org_default`, `course_orgs = (2, 1, 1)`,
and `resolvePersonaForChat` returning `source: 'course'` for
`itps-uas-remote`, `source: 'org-default'` with no course, and `org-default`
for an unknown slug.

`ACTIVE_ORG_ID=1` lives in `.env.local`, which is now the project's only env
file: `.env` was removed, so `vite.config.ts` loads `./load-env.ts` (a
side-effect module — a bare `config()` call would run *after* the theme
plugin's env validation, because ESM evaluates imported module bodies first)
and every `dotenv -e` script and `drizzle.config.ts` points at `.env.local`.

## Runtime resolution

```
chat.ts  (courseSlug optional)
  └─ course_orgs.personaId   where courseSlug → course, orgId = ACTIVE_ORG_ID
  └─ orgs.defaultPersonaId   for ACTIVE_ORG_ID
  └─ undefined               → viper7.ts per-field defaults
```

Reads `content`. **Never** `draftContent`. `getPersona(name)` is deleted.

## UI

AI Training modal → `SectionedConfigModal`, sections:

1. **Training documents** — today's upload card + embeddings list, unchanged.
2. **Persona** — `fill: true`, a 2-screen Motion carousel.

Track: `animate={{ x: pane === 'editor' ? '-50%' : '0%' }}`, wrapper
`overflow-x: hidden`, spring `{ type: 'spring', duration: 0.35, bounce: 0 }`.
Off-screen pane gets `inert` + `aria-hidden`. `useReducedMotion()` swaps the
translate for an opacity crossfade.

**Screen 1 — list.** Per row: name · "use for this course" radio · org-default
star · Draft badge · delete. The radio checks the *effective* persona (pin, else
org default); there is no separate "use the org default" row — see Deviation 3.
Radio and star are disabled while the persona has never been published, reason
stated (#24). Both writes are optimistic (Deviation 4). "New persona" → inline
name → POST → slides to the editor.

**Screen 2 — editor.** Header: save status ("Saving… / Saved / Couldn't save")
· **Publish** · **Done**. Body: name input, 6 auto-grow textareas, quotes list.
Empty fields labelled "using default".

## API

| Route | Methods |
| --- | --- |
| `api/admin/personas.ts` | GET (active org's personas), POST (create) |
| `api/admin/personas.$personaId.ts` | PATCH (name), DELETE |
| `api/admin/personas.$personaId.draft.ts` | POST (autosave, beacon-compatible) |
| `api/admin/personas.$personaId.publish.ts` | POST |
| `api/admin/personas.$personaId.default.ts` | PUT (org default) |
| `api/admin/courses.$courseId.persona.ts` | PUT (set/clear selection) |

All `requireAdmin`-guarded, thin over `src/db/persona.ts`; hooks in
`src/data-hooks/`, keys in `dataKeys`.

## Failure behaviour

| Scenario | What happens | Admin sees |
| --- | --- | --- |
| `ACTIVE_ORG_ID` unset or not an integer | Helper throws on first use | Server error naming the variable |
| Course has no `course_orgs` row for the active org | Falls through to the org default | Persona tab explains the course isn't linked to the active org |
| `course_orgs.personaId` is NULL | Org default | List shows "using org default" |
| Org default is NULL too | `persona` undefined → prompt's built-in defaults | List shows no default set |
| Debounced autosave fails | Status flips to "Couldn't save"; retries on next change | Inline status, no toast spam |
| Beacon flush fails | Silently lost — up to 800ms of typing | Nothing (the reason beacon is only the last-gasp path) |
| Rename collides within the org | 409 | Inline error on the name field; name reverts |
| Persona deleted while a course uses it | References set NULL; course falls back to org default | Confirm dialog named the courses beforehand |
| Persona deleted while it is the org default | `orgs.defaultPersonaId` set NULL | Same confirm dialog said so |
| Two admins edit one persona | Last write wins | Stale tab keeps its own text until refetch |
| Publish with no draft | Button disabled | — |

## Accepted risks

- **Beacon loss.** A crash between debounce ticks loses ≤800ms of typing, and a
  failed beacon is unreportable by design. Bounded and cheap.
- **Last-write-wins on concurrent edits.** No optimistic-concurrency guard; the
  surface is admin-only and effectively single-operator.
- **Course 2's explicit override** (#28) means org-default changes won't reach
  it. Mitigated by labelling, not by logic.
- **`orgId` is authored-scoped, not learner-scoped.** A learner from another org
  studying a shared course still gets that course's persona for the active org.
  Correct under the single-active-org model; revisit if a second org goes live.
- **Autosave request volume.** Each save carries the whole persona payload
  (several KB with quotes). Debounce + max-wait bound it; not otherwise
  optimised.

## Assumed (not confirmed)

- Table name `course_orgs`; helper at `src/lib/active-org.server.ts` (API routes
  import `.server.ts` today — `admin-functions.server.ts` — so this is the
  established pattern, but `pnpm build` is the only real check).
- Beacon payload is `new Blob([json], { type: 'application/json' })`; the draft
  route accepts POST with cookie auth and returns 204.
- Seed script wired as `db:seed-org-links`, matching `db:grant-admin`'s
  `dotenv -e .env -- tsx` form.
- The persona list and editor are presentational and prop-driven (hookless,
  per the repo's render-test constraint), with one container above them.
- Quotes are edited as a list of strings with add/remove, mirroring the old
  form's field array.
- `PersonaSchema` keeps its 7 remaining fields as `z.string()`; blank means
  "fall back", enforced by the prompt's existing `||`.

## Out of scope

- **Sessions** and **Test chat** sections from the old admin page.
- Multi-org attachment UI — `course_orgs` supports many-to-many, but nothing in
  the UI adds a second org yet.
- Org-scoping anything other than personas.
- Per-learner persona selection.
- Migrating the old repo's `viper7-training.tsx` (this repo's embeddings flow
  already supersedes it).

## Tests

- `src/routes/api/__tests__/chat.test.ts` — assert on `buildChatStream`'s mock
  call args: course selection wins; org default when the selection is NULL;
  `undefined` when neither; and `draftContent` **never** reaches it.
- `src/ai/prompts/__tests__/viper7.test.ts` — `persona.quotes` appear in the
  prompt text; the const is used when the array is empty.
- Route tests — `requireAdmin` 403; list filtered to the active org;
  composite-unique 409 on rename; publish copies then nulls; delete nulls both
  reference sites.

## Built

| Area | Files |
| --- | --- |
| Schema | `src/db/schema.ts` (`personas` + 3 columns, `course_orgs`), `src/types.ts` (`PersonaSchema`) |
| Storage | `src/db/persona.ts` (rewritten), `src/db/course-orgs.ts` |
| Active org | `src/lib/active-org.server.ts` |
| Migration | `src/db/migrate-org-personas.ts`, `src/db/seed-org-links.ts`, `src/db/seed-persona.ts` |
| Runtime | `src/routes/api/chat.ts`, `src/ai/prompts/viper7.ts` (quotes), `src/db/admin.ts` (`createCourse` links the org) |
| API | `src/routes/api/admin/personas*.ts`, `courses.$courseId.persona.ts` |
| Hooks | `src/data-hooks/use-personas.ts`, `use-course-persona.ts`, `keys.ts` |
| UI | `src/components/admin/persona/*`, `sectioned-config-modal.tsx` (`fill`), `course-embeddings-dialog-container.tsx`, `src/atoms/admin.ts`, `src/styles.css` |
| Env | `load-env.ts`, `vite.config.ts`, `drizzle.config.ts`, `package.json` |
| Deleted | `src/components/admin/course-embeddings-modal.tsx` (single consumer) |

`pnpm test` 1750 passing / 203 files · `tsc` clean · `biome` clean · build
green with all six routes in `routeTree.gen.ts`.

The draft guard was mutation-tested: making the chat route forward
`draftContent` turns `never hands a draft to the prompt builder` red, and green
again on revert — so it is a regression test that has actually been red once.

## Open

- Exact copy for the disabled-assign reason (#24) and the override vs
  org-default labels (#28). Cheap, will pick something consistent with the
  existing admin voice.
- Whether the Persona section should surface *which* persona is currently
  effective for the course as resolved text ("ITPS default → Viper7"). Leaning
  yes; trivial to add once the chain exists.
- **Untested in a browser.** The carousel slide, autosave debounce, and the
  `sendBeacon` tab-close flush have unit-level and DB-level cover but no
  end-to-end run. The beacon path in particular can only be confirmed by
  closing a tab mid-edit and reopening the modal.
- The `docs` / `uniq_course_source_heading_chunk` drift above, which is
  unrelated to personas but now blocks a clean `db:push`.
