# Lesson versions — design

Date: 2026-11-24. Status: agreed with the user (three grilling rounds, same day).

## Intent

Today a course points at the live lesson, so an SME's edit in Disciplines
reaches every course at once. After this change Disciplines holds the working
copy, and each course holds a frozen snapshot of it at a version. Editing the
working copy never changes a course. A course moves to a newer version only
when someone taps its version chip and confirms.

## Terms

- **Working copy:** the `lessons` row plus its `lesson_material`. Edited in
  Disciplines only.
- **Snapshot:** a read-only `lesson_versions` row, one per lesson and version.
- **Pin:** a `course_lesson_versions` row saying which snapshot a course uses.
- **Taken:** a version that has a snapshot. A course taking a version creates it.

## Data

- `lessons.version` text, default `1.0`. `lessons.content_updated_at`: last
  content edit, shown in the update dialog.
- `lesson_versions`: unique (`lesson_id`, `version`). Frozen content: name,
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
- `major.minor`, digits only, no leading zeros, at most four digits a part.
  `1.10` is higher than `1.9`.
- Required. Starts at `1.0` for new and duplicated lessons.
- May be changed freely while untaken, but must stay higher than every taken
  version of the lesson.

### Editing in Disciplines
- A taken version is locked for good, even if no course uses it any more.
- Changing content (text, name, video, a language) on a locked version is
  refused unless the request carries a higher version. Bump and change are one
  step.
- The editor says why, always visible while locked: "v1.0 is used by 3 courses.
  Enter a higher version to make changes." With no course left: "v1.0 was used
  by a course. Enter a higher version to make changes."
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
- Chip on course cards: `v1.0`, green when it equals the working copy's version
  (tooltip "Up to date with Disciplines", not clickable), gold with an up arrow
  otherwise (tooltip "Disciplines has v1.1. Update this lesson").
- Clicking gold opens "Do you want to update this lesson?" with both versions
  and when the lesson was last edited. Confirming moves this course only.
- Who: anyone with `structure: update` on that course, borrowed modules included.
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
   course stay `1.0`, untaken and freely editable.
2. Existing key-point rows and lesson search rows are labelled with that
   snapshot. Nothing is re-embedded.
3. Order: run the migration, deploy, run the migration again. It is re-runnable;
   the second run picks up anything added between the two. The user runs it
   (`.env.local` is prod).
4. First edit of any lesson already in a course then needs `1.1`.

## Accepted limits

- A course can take a half-edited version. The SME bumps and it updates again.
- A snapshot stores the video's id. Changes inside Synthesia or Mux affect every
  version using that id.
- Hiding a lesson in Disciplines still hides it in every course.

## Non-goals

Release step, version history screen, rollback, bulk update, per-course
settings, versioning modules or disciplines.
