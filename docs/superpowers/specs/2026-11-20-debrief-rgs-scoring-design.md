# Debrief scoring to the RGS doc — design

Date: 2026-11-20. Status: draft for review.
Source: stakeholder doc "RGS Calculations and Debrief Flow" (2026-11-20),
plus the user's rulings the same day.

## Intent

Make the debrief score and flow match the stakeholder's doc. A lesson is
passed on a **total score** built from its video, quiz and debrief, compared to
a **pass mark** the course manager sets per course. Today a debrief passes on
its set average alone (fixed 75), the quiz plays no part, and a failed debrief
locks the retake for 6 hours.

## Goals

### Total score (user, 2026-11-20)

Out of 100, using the progress ring's weights:

| Lesson has | Weights |
|---|---|
| video + quiz + debrief | video 50, quiz 25, debrief 25 |
| video + quiz | video 50, quiz 50 |
| video + debrief | video 50, debrief 50 |
| quiz + debrief (no video) | quiz 50, debrief 50 |
| one part only | that part 100 |
| none | auto pass |

Each part's fraction:

- **Video:** watched milestones / total.
- **Quiz:** correct answers / questions in the latest attempt. The quiz's share
  is split evenly across however many questions it has (no assumption of 5).
  Not taken = 0.
- **Debrief:** the better set's average (each set of 4 scored on its own; the
  better set counts, not best 4 of 8).

"Has video" means it has a video it requires watching (`needsVideoWatch`).
"Has debrief" means the debrief counts: required (`has_debrief`) and not a
3D Airmanship discipline lesson. This is the same rule the ring uses.

### Pass mark

- A new per-course setting, default **85**, integer 0–100.
- Set on the **Schedule tab**, on each course's card.
- The attempt is judged against the pass mark of the course it was taken in.

### Debrief flow (doc wording)

- **12h wait before the first debrief:** unchanged. Other tabs and rewatching
  stay open.
- **Feedback on every answer:** unchanged.
- **Judging a set:** the total score with this set as the debrief, against the
  pass mark.
- **Set 1 passes:**
  - The pass is recorded at once.
  - Prompt: "That's great. Based on these answers you've met or exceeded the
    standard for this knowledge chunk. You can still try to improve your score
    by answering four more questions from different KEYS. It will only affect
    your score if you do better" — **Yes / No**.
  - Yes opens set 2. No: "Okay that's fine. Just proceed to the next video."
  - No set 2 available (4 or fewer key points): no offer.
- **Set 1 fails:** "Let's try some of the other teaching points", then set 2.
- **Set 2 done:** the better set counts.
  - Pass: recorded.
  - Fail: prompt to study the KEYS or the video, then choose **Now** (a fresh
    draw starts immediately) or **Later** (leave it; the red D stays until a
    pass; return any time).
  - **The 6-hour retake wait is removed.**
- **A retake is the same shape:** set 1 of 4, then set 2 if set 1 is missed.
- **Every set result shows the sum,** e.g. "Video 50 + Quiz 20 + Debrief 15.1
  = 85.1 · pass mark 85". When the quiz isn't taken yet, it says so, since
  taking it adds points.

### The quiz can complete a debrief

The doc: "when any set of four questions plus corrected quiz exceeds the RGS
standard they have completed that KC." So when a quiz attempt is saved, the
lesson is re-scored with the best debrief set so far. If the total now reaches
the pass mark, the debrief pass is recorded, with no retake needed.

## Non-goals (parked)

- Viper tracking unpassed debriefs and nudging the learner.
- The "before the last day of the training period" deadline.
- Course completion message, informing the course manager, the arrival /
  flight-training date.
- Lesson completion (`done`) and the progress ring are unchanged. The total
  score decides the debrief pass; it does not gate completion or replace the
  ring. (My call: the ring is progress, the total is the grade.)

## Constraints

- A recorded pass (`debrief_passes`) stays the only source of "debrief
  passed", and passes stay final. The D badge, the ring and course counting
  keep reading it unchanged.
- **Migration:** `courses.pass_mark integer not null default 85` with a
  0–100 check.
  - A hand-written, re-runnable script like `db:migrate-doc-source`, never
    `db:push`.
  - The user runs it on prod before deploy (`.env.local` is prod).
- **Pass mark endpoint:** it updates the pass mark and guards with
  `requireAdmin`.
- **Repo rules apply:** TanStack Query, react-hook-form + zod, jotai, and the
  presentational/container split.

## Design notes

- **One pure, client-safe function** computes the total and its breakdown from
  the parts present and their fractions. The answer route, the quiz route and
  the Debrief tab all use it.
- **The set rules change** from "average ≥ 75" to "total with this set ≥ pass
  mark". `setsProgress` takes a judge function instead of the constant.
- **New attempt state:** "passed, set 2 offered". The attempt stays open until
  the learner answers Yes / No. On resume the offer shows again. No ends the
  attempt (`set-passed`). Yes reveals set 2, and set 2 finishing ends it with
  the better set.
- **`totalScore` on a finished attempt** stores the better set's average.
  Today it stores the last set's.
- **The quiz route** re-scores the lesson after saving and records a pass when
  the total reaches the mark. It uses the course from the quiz request.
- **Optional debriefs** (switch off) run the same flow and prompts, judged as
  if the debrief counted. The pass is recorded, but the lesson total and the
  ring leave it out, as today.

## Left to the builder

- Endpoint shape for the Yes / No offer.
- Exact layout of the score breakdown and the Schedule-tab field.
- Rounding: show one decimal; compare unrounded.

## Known edge

3D Airmanship lessons appear in every course, and a pass is per lesson. A pass
earned against one course's mark carries into a course with a higher mark.

## Rollout

Migrate (user, on prod) → merge → deploy.
