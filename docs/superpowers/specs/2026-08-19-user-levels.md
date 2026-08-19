# User Levels — Spec

**Status:** Agreed 2026-08-19 via grilling session.

A pilot has a **level per course** — `basic`, `intermediate`, or `advanced`. Lessons
carry a **set** of levels. A pilot sees a lesson when the sets intersect: **exact
match, not a ceiling.** An Advanced pilot does not see Basic lessons.

---

## 1. Storage model

Levels live in an **append-only, timestamped `user_levels` table**. There is no
level column on `user_profiles`. The current level is the **latest row** for that
`(user_id, course_id)`.

```sql
CREATE TABLE IF NOT EXISTS user_levels (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     varchar(255) NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  course_id   integer      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  level       text         NOT NULL,   -- basic | intermediate | advanced
  source      text         NOT NULL,   -- enrolment | earned | admin
  message     text,                    -- pilot-facing; REQUIRED when source='admin'
  note        text,                    -- admin-only
  changed_by  varchar(255),            -- acting admin's user id; NULL for system rows
  acknowledged_at timestamp,           -- set when the pilot dismisses the change notice
  created_at  timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_levels_lookup
  ON user_levels (user_id, course_id, created_at DESC);

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS levels text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS lessons_levels_gin ON lessons USING gin (levels);
```

`lessons.levels = '{}'` means **all tiers**. The existing catalogue is untagged, so
it stays fully visible on deploy and the feature switches on lesson by lesson as
authors tag content.

`source` distinguishes the three row origins. Only `admin` rows require a `message`.

**Why append-only rather than a column:** the requirement is to capture that a
pilot *becomes* intermediate or advanced — the transition, not just the current
value. A column alone cannot answer "when did they advance?" or "how long is the
average pilot at Basic?".

---

## 2. Promotion

- Triggered **only** by a pilot completing their current tier — **100%**. No
  threshold, no skipping via the automatic path.
- The denominator is **per user**: lessons in that course whose `levels` contains
  the tier **or is empty**, that are `isAvailable`, and that the pilot is entitled
  to via `requiredSubscriptions`. Unreachable lessons never block advancement.

  **Correction (verified 2026-08-19):** `requiredSubscriptions` is *not enforced
  anywhere* in `src/` — it is stored, admin-edited and shipped in the payload, but
  no query filters on it. Access is decided solely by a `course_subscriptions` row.
  The entitlement clause is therefore vacuous today and is retained only so the
  denominator stays correct if enforcement is ever added. **Do not add the filter
  as part of this work** — it would hide lessons that are visible today.
- "Completed" **reuses the existing lesson-completion definition**: `lessonPercent`
  `=== 100` (`src/lib/course-progress-agg.ts:122`), read via `getCourseProgress`.
  Note this is *not* the same as `watched` (`:140`), which is what feeds the gate
  today and is deliberately weaker.
- The write is **synchronous** with the lesson-completion request, so the response
  can tell the UI a promotion happened.

  **There is no single "lesson completed" event.** Completion emerges from four
  independent writes: section taps (`/api/user/lesson-section`), video milestones
  (`/api/user/report-video-progress`), quiz submit, and debrief save-results. A
  shared `maybePromote` runs after each, with an early-out when the pilot is
  already `advanced`.
- The system **only ever writes upward**. Content edits never demote anyone. A
  Basic lesson added later is material that promoted pilots have moved past.
- On enrolment, a `basic` row is written **once, idempotently**, through a single
  helper — re-enrolling never resets an Advanced pilot.

**Rejected: recomputation.** Recomputing the level whenever completion *or content*
changes means adding one new Basic lesson finds every Advanced pilot's Basic tier
incomplete, writes `basic` for all of them, and — under exact match — removes every
Advanced lesson from every Advanced pilot simultaneously. One content edit
mass-demotes the user base.

---

## 3. Visibility

- **Filter first, then gate.** The visible lesson set is computed by level, and the
  existing prerequisite logic runs over **that filtered set only**. Lessons you
  can't see never gate lessons you can.

  Without this, `modules.sequentialLessons` (default `true`) makes lesson N+1
  require lesson N; in a mixed-tier module an Intermediate lesson sitting behind a
  Basic one is permanently locked, with a lock reason naming a lesson the pilot
  cannot open.

- Modules with **no visible lessons are hidden entirely.**

- A URL to an out-of-tier lesson the pilot **has completed** opens **read-only** —
  video, quiz answers, debrief all visible, every control inert. This doubles as
  the "your earlier work is still here" surface promised in §5.

  **Enforcement location matters.** `evaluateLessonLock` returns `{kind:'open'}` for
  a lesson it cannot `locate()`, so filtering lessons out inside `toGateCourse`
  would *unlock* out-of-tier lessons. The level check belongs in
  `evaluateLessonGate` (`src/lib/lesson-gating.server.ts:38`), which already fails
  closed.

- A URL to an out-of-tier lesson they have **never** completed redirects to the
  course index with an explanation naming their current level.

  One rule: **out-of-tier content you've done is read-only; out-of-tier content you
  haven't is not yours.**

---

## 4. Admin

- A level `<Select>` **per enrolled course**, inside the existing **Courses**
  section of the user detail modal, with a history disclosure showing prior rows,
  timestamps, actors, messages and notes.
- Admin insert is **unconstrained** — any level, any direction, any jump. It is the
  **only correction path in the system**, because the automatic path only ever
  writes upward.
- `message` is **required** on admin rows and **shown to the pilot**. `note` is
  optional and admin-only. Two fields so neither audience gets a message written
  for the other.
- Guarded by a **new `level` permission entity** — not folded into
  `enrolment:update`, which is documented as non-grantable because "a subscription
  row has nothing to edit" (`src/lib/admin-schemas.ts:517`).
- A **filter** on the users list (level × course). **No column** — with N enrolled
  courses there is no single value to show.
- The lesson editor gets a `levels` chip picker. Note `requiredSubscriptions` is a
  two-option `BinaryToggle`, not a multi-select — the control to mirror is
  `ModuleDependencyPicker` (`src/components/admin/module-dependency-picker.tsx:35`,
  Base UI `Combobox` with `multiple`), dropped into a `ConfigSettingRow` with
  `layout="stacked"`.
- When a change will hide lessons the pilot has **in progress**, the confirmation
  says so and gives the count.

---

## 5. What the pilot experiences

- Their level is **visible** on the course.
- On earning a promotion: an **in-flow interstitial** at the moment of completion,
  plus an **email**.
- On an admin change: a notice on next load, carrying the admin's `message`.
- Stored values stay `basic` / `intermediate` / `advanced`; **display labels live in
  a separate map** so renaming is not a migration.

**Why visible:** under exact match an Advanced pilot's course contains *fewer*
lessons than a Basic pilot's. A silently promoted pilot returns to find every
lesson they completed gone and different ones in their place — that reads as data
loss, not achievement.

---

## 6. Accepted tradeoffs

1. **A pilot tagged straight to Advanced can never see Basic material.** They never
   completed it, so §3 sends them to the course index. Only an admin demotion gets
   them there.
2. **New lower-tier content never reaches promoted pilots.** Authors must know that
   adding a Basic lesson reaches only pilots still at Basic.
3. **Read-only lesson rendering is a genuine new mode** — every write path on the
   lesson page must be inert, not merely hidden.
4. **Course structure differs per pilot**, so support screenshots won't match
   between users.

---

## 7. Conventions this must follow

- `text` + const-tuple → `z.enum`, **not** `pgEnum` (no `pgEnum` exists in this repo).
- PKs are `integer().primaryKey().generatedAlwaysAsIdentity()`, not `serial`.
- Timestamps in `src/db/schema.ts` are `timestamp('...', { mode: 'date' })`.
- Migrations are **hand-written idempotent SQL run via `tsx`**, never `db:push` —
  `db:push` offers to truncate `docs` (6917 embedding rows) over unrelated drift.
- Tests assert on **what the consumer received**, not that a value exists in state.
- The progress table is `lesson_material_progress` (`src/db/schema.ts:364`).
- `getCourseDetailsWithCache` is Redis-cached under `course-details-v3`
  (`src/db/course.ts:193`) with a 6h TTL. Adding `levels` to the payload **requires
  bumping the prefix to `v4`** — a stale entry deserialises without the field and
  silently opens gates.
- `updateLessonConfigInputSchema` is `.strict()` (`src/lib/admin-schemas.ts:161`);
  an unknown `levels` key 400s until added there.
