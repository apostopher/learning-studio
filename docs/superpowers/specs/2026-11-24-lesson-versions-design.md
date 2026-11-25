# Lesson versions — design

Date: 2026-11-24. Status: agreed with the user (three grilling rounds, same day).
Amended 2026-11-25: a version is only a label. It is never ordered, it never
locks a lesson, and it may be used again. Its job is to remind people that a
course may want an update; updating is up to them. No update dialog: a course
updates by removing the lesson and dragging it in again.

## Intent

Today a course points at the live lesson, so an SME's edit in Disciplines
reaches every course at once. After this change Disciplines holds the working
copy, and each course holds a frozen snapshot of it at a version. Editing the
working copy never changes a course. A course moves to a newer version only
when the lesson is removed from it and added again.

## Terms

- **Working copy:** the `lessons` row plus its `lesson_material`. Edited in
  Disciplines only.
- **Snapshot:** a read-only `lesson_versions` row. Several snapshots of a lesson
  may carry the same version.
- **Pin:** a `course_lesson_versions` row saying which snapshot a course uses.
- **Taking:** a course pins a snapshot of the working copy as it is now. One with
  the same version and content is used again; otherwise it is created.

## Data

- `lessons.version` text, default `1.0`. `lessons.content_updated_at`: last
  content edit, shown in the update dialog.
- `lesson_versions`: indexed, not unique, on (`lesson_id`, `version`). Frozen
  content: name,
  video provider and ref, other-language videos, text, key points, quiz, pro
  tips, links, assignments, Job of the Day, TEST THIS!, and which closing tab
  it shows (`extra_tab`). `text` null means the lesson had no material.
- `course_lesson_versions`: primary key (`course_id`, `lesson_id`). It covers
  borrowed modules too, so every course has its own version of each
  3D Airmanship lesson.
- The lesson keeps its id and slug, so URLs and learner records survive.

Not versioned (shared, as today): visibility, paid/free, levels, debrief
switch, video watch, discipline and module filing.

Attachments (`blob_file_assignments`) stay shared. Nothing in the app edits
them, so there is nothing to freeze. This narrows the list in the interview.

## Rules

### Version numbers
- `x.x`: digits only, no leading zeros, at most four digits a part.
- Required. Starts at `1.0` for new and duplicated lessons.
- A label: any value, at any time, up or down, used before or not.

### Editing in Disciplines
- Never blocked by the version. Only a malformed number is refused.
- Any content write can carry a version. An edit without one keeps the label, so
  chips stay green and courses keep their copy. That is the author's choice.
- The field says: "Courses keep their own copy. Change the version to flag an
  update."
- The Version field sits under "Other languages" in the video column. It saves
  with the header button, renamed "Save". A version-only change saves without
  needing valid material.
- A lesson used by any course cannot be deleted. The message names the courses.

### Courses
- Adding a lesson to a course by any route takes the current working copy:
  drag, module copy, remix, new course. Removing and re-adding takes the
  current one again.
- Moving a lesson between modules of one course keeps its pin. Dragging it to
  another course adds it there, so it takes the current one.
- Chip on course cards: `v1.0`, green when it equals the working copy's version,
  gold with an up arrow otherwise. A flag only: nothing opens when it is clicked,
  and its tooltip says how to update.
- To update: remove the lesson from the course and drag it in again from
  Disciplines. Nothing else moves a course.
- 3D Airmanship has its own column in the Knowledge library (it had none), so its
  lessons update the same way. That moves every course borrowing the module. The
  course itself cannot be deleted there.
- A lesson added back to the module it was removed from gets its old place and
  prerequisites back (`removed_placements`). In another module it starts fresh.
  Learner progress stays. A lesson in two modules of one course keeps its copy until it
  is removed from both.
- The chip compares versions, not content.
- Who: anyone with `structure: update` on the course owning the module.
- No bulk update, no automatic update, no going back.
- Disciplines card: `v1.0` in a neutral colour.
- Content is read-only in a course. The pencil leaves editor course cards.
  "Configure lesson" keeps Config, credentials and the course's video, and
  replaces the content form with "Content is v1.0. Edit it in Disciplines."
- Creating a lesson inside a course is removed.

### Learners
- They get their course's snapshot everywhere: name, video, languages,
  captions, material, quiz, progress facts, debrief, Viper.
- They never receive a version number.
- On update, completions, passes, quiz answers, section ticks and video
  progress carry over. An unpassed debrief starts over. An open attempt can be
  finished; it is graded from its own stored snapshot.
- Debrief key points (`lesson_knowledge_chunks`) are stored per snapshot.
- Viper searches the lesson chunks of the learner's course snapshots. Outside a
  course it already searches no lesson content, so nothing changes there. The
  admin Viper preview uses the lesson's newest snapshot.

## Rollout

1. Every lesson a course shows gets a `1.0` snapshot and a pin. Lessons in no
   course stay `1.0`, with no snapshot.
2. Existing key-point rows and lesson search rows are labelled with that
   snapshot. Nothing is re-embedded.
3. Order: run the migration, deploy, run the migration again. It is re-runnable;
   the second run picks up anything added between the two. The user runs it
   (`.env.local` is prod).
4. 2026-11-25 amendment: deploy, then run the migration. It makes a lesson's
   versions non-unique.

## Accepted limits

- A course can take a half-edited version. The SME changes the label and it
  updates again.
- Two courses on `v1.0` may hold different content, and a green chip may hide an
  edit.
- A snapshot stores the video's id. Changes inside Synthesia or Mux affect every
  version using that id.
- Hiding a lesson in Disciplines still hides it in every course.

## Non-goals

Release step, version history screen, rollback, bulk update, per-course
settings, versioning modules or disciplines.
