# Lesson card layout: full-width name, eye toggle, version placeholders

Date: 2026-11-19. Short design: a small change. Approved in conversation.

## Why
The admin lesson card squeezes the lesson name into a row shared with the
Draft label and four icons, so long names clamp early. A design mockup moves
the name to its own full-width line and adds a version flag ahead of a
versioning system that will come later.

## Goals
- Name gets its own line at full width; truncates only when it doesn't fit,
  with the full name on hover (existing `ClampedText`).
- Icons (eye, edit, remove, delete, drag) move to the row below the name.
- The Draft label becomes an eye toggle button: open eye = students can see
  it, crossed eye = draft. Clicking flips `isAvailable` through the SAME
  mutation the Config tab's public/draft toggle uses. The accessible name
  and tooltip say the state and what a click does
  ("Hidden from students. Show it" / "Visible to students. Hide it").
  The draft state carries a tint so it stays as noticeable as the word was.
- Course board card: an inert yellow "Ver" chip at the end of the chip row.
  Tooltip and accessible name: "Ver: lesson versions are coming soon".
- Discipline library card: a "Vers 3.4" placeholder under the name at
  `opacity: 0` and `aria-hidden` (user's call), reserving its space until
  versioning exists.

## Non-goals
- Any versioning data, schema or logic.
- The "written and curated by human Subject Matter Experts" banner.

## Constraints
- FREE/PAID chip stays (it is the free/paid control), though the mockup
  omits it. User may revisit.
- Presentational card stays pure; the toggle's mutation lives in the
  containers, passed in as a prop like `remove`.
- Logical properties, tokens only, WCAG AA (project rules).

## Approaches
One sensible way: rearrange the existing `LessonCard` and reuse the existing
config mutation. A separate card per surface was rejected: both surfaces
share `LessonCard`, and forking it would duplicate every other control.

## Left to the builder
Exact icon sizes, gap values, and the yellow token for the Ver chip (an
existing warning/accent chip tone, contrast-checked).
