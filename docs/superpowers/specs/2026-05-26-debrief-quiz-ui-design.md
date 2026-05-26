# Debrief Quiz UI Design

## Overview

An exam-style UI that renders AI-generated test questions inside the existing lesson material tabs. When the user taps "Debrief" on the video overlay, the quiz tab activates and scrolls into view. Questions are presented one at a time with immediate per-question grading. A score report with per-question review is shown at the end.

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Tab activation | Controlled Tabs via Jotai atom | Debrief flow needs to programmatically switch to quiz tab |
| Question flow | One question at a time | Focused exam experience, immediate feedback per question |
| Grading | Immediate after each submit | User sees result before moving to next question |
| Report | Summary + per-question review | Full transparency on what was right/wrong and why |
| Retake | Yes, generates fresh questions | Allows improvement; resets all state |
| Auto-save | On test completion | Results persist to DB without manual action |

## Tab Integration

### Controlled Tabs

`LessonMaterialView` currently uses `Tabs.Root` with `defaultValue="keyPoints"` (uncontrolled). Change to controlled mode:

- New atom: `activeTabAtom` in `src/atoms/lesson-ai-test.ts`, default `"keyPoints"`
- `Tabs.Root` uses `value={activeTab}` and `onValueChange={setActiveTab}`
- The `LessonMaterialView` becomes a container component (it now reads an atom)

### Debrief Trigger

When the user taps "Debrief" on the video overlay:

1. `useGenerateTest()` fires (already wired in `LessonPlayerContainer`)
2. On successful generation, set `activeTabAtom` to `"quiz"`
3. Smooth-scroll to the lesson material section using `element.scrollIntoView({ behavior: "smooth" })`

The scroll target is the `Tabs.Root` element. Add a ref to it.

### Quiz Tab Content

The quiz `Tabs.Panel` renders conditionally based on AI test state:

```
currentTest === null     →  Static quiz (existing material.quiz, as-is)
currentTest !== null     →  DebriefQuizContainer (the new exam flow)
  └── test in progress   →  QuestionCard (one at a time)
  └── test complete      →  ScoreReport
```

"Test complete" = all questions have evaluations (evaluations.length === currentTest.questions.length).

## Question Flow

### QuestionCard

Presentational component. Renders one question at a time.

**Layout:**

```
┌─────────────────────────────────────────┐
│  ● 3 of 20                             │
│                                         │
│  Question text in markdown...           │
│                                         │
│  ○ Option A                             │
│  ○ Option B                             │
│  ○ Option C                             │
│  ○ Option D                             │
│                                         │
│              [ Submit ]                 │
└─────────────────────────────────────────┘
```

**MCQ variant:**
- Radio group with 4 labeled options
- Submit disabled until an option is selected
- After submission, show result inline (see below)

**Free-text variant:**
- Textarea, 3-4 rows, with placeholder "Type your answer..."
- Submit disabled while textarea is empty
- After submission, show result inline

### EvaluationCard

Shown after the user submits an answer. Replaces the input area within the same card.

**Layout:**

```
┌─────────────────────────────────────────┐
│  ● 3 of 20                    [100/100] │
│                                         │
│  Question text in markdown...           │
│                                         │
│  ✓ Option B (correct)                   │
│    Option A                             │
│    Option C                             │
│    Option D                             │
│                                         │
│  ┌─ Explanation ─────────────────────┐  │
│  │ The correct answer is Option B    │  │
│  │ because...                        │  │
│  └───────────────────────────────────┘  │
│                                         │
│              [ Next → ]                 │
└─────────────────────────────────────────┘
```

**Score badge colors:**
- 80-100: green (accent success)
- 50-79: amber (accent warning)
- 0-49: red (accent error)

**MCQ after submit:**
- Correct option highlighted green
- User's wrong pick highlighted red (if wrong)
- Other options dimmed

**Free-text after submit:**
- User's answer shown in a quoted block
- AI explanation below

### Navigation

- "Next" button advances `currentQuestionIndex` (uses `useAdvanceQuestion`)
- On the last question, "Next" is replaced with "See Results"
- No back navigation (exam-style, one direction)

## Score Report

Shown when `evaluations.length === questions.length`.

### Summary Header

```
┌─────────────────────────────────────────┐
│         ┌──────┐                        │
│         │ 85%  │   Excellent            │
│         └──────┘                        │
│    17 of 20 questions correct           │
│                                         │
│   [ Retake ]        [ Save & Close ]    │
└─────────────────────────────────────────┘
```

- Circular progress ring showing percentage
- Grade label based on score:
  - 90-100: "Excellent"
  - 70-89: "Good"
  - 50-69: "Needs Review"
  - 0-49: "Keep Practicing"
- Count of questions scoring >= 70 shown as "X of Y questions correct"

### Per-Question Review

Expandable list below the summary. Each row:

```
┌─ Q1  [100] ─ A drone pilot has just had... ──── ▼ ─┐
│                                                      │
│  (collapsed by default, expand to see full detail)   │
│                                                      │
│  Your answer: Option B                               │
│  Correct answer: Option B                            │
│  Explanation: ...                                    │
└──────────────────────────────────────────────────────┘
```

Uses Base UI `Collapsible` for expand/collapse.

### Actions

- **Retake**: Resets `currentTestAtom`, `evaluationsAtom`, `currentQuestionIndexAtom`. Calls `useGenerateTest()` again to produce fresh questions.
- **Auto-save**: `useSaveResults()` is called automatically when the report renders (via effect). No manual save button needed.

## File Structure

```
src/components/lesson-material/
  lesson-material.tsx              — MODIFY: controlled tabs via atom, ref for scroll
  parts/
    debrief-quiz-container.tsx     — CREATE: container, reads atoms, orchestrates flow
    question-card.tsx              — CREATE: presentational, renders one question + input
    evaluation-card.tsx            — CREATE: presentational, renders graded result
    score-report.tsx               — CREATE: presentational, summary + review list
    score-ring.tsx                 — CREATE: presentational, circular progress SVG

src/atoms/
  lesson-ai-test.ts                — MODIFY: add activeTabAtom

src/components/lesson-main/parts/
  lesson-player-container.tsx      — MODIFY: set activeTabAtom + scroll on debrief
```

## Component Hierarchy

```
LessonMaterialView (controlled tabs)
  └── Tabs.Panel value="quiz"
        ├── Static quiz (when no AI test)
        └── DebriefQuizContainer (when AI test exists)
              ├── QuestionCard + submit state (test in progress)
              │     └── EvaluationCard (after submit, before next)
              └── ScoreReport (test complete)
                    └── ScoreRing
```

## State Management

All state lives in existing atoms from `src/atoms/lesson-ai-test.ts`:

- `currentTestAtom` — the generated test (null = no test)
- `currentQuestionIndexAtom` — which question is shown
- `evaluationsAtom` — graded results array
- `isEvaluatingAtom` — loading state for submit
- `totalScoreAtom` — derived average score

New atom:

- `activeTabAtom` — controls which tab is active in the material section, default `"keyPoints"`

No new hooks needed. The existing `useGenerateTest`, `useEvaluateAnswer`, `useAdvanceQuestion`, `useSaveResults`, and read hooks cover all interactions.

## Scroll Behavior

When debrief generates a test:

1. Set `activeTabAtom` to `"quiz"`
2. After a microtask (to let React render the tab), call `tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })`

The ref is on the `Tabs.Root` element in `LessonMaterialView`.

## Scope

**In scope:**
- Controlled tabs with Jotai atom
- Debrief → quiz tab activation + scroll
- Question cards (MCQ + free-text)
- Evaluation cards with score + explanation
- Score report with progress ring + expandable review
- Retake flow
- Auto-save on completion

**Out of scope:**
- Test history UI (viewing past attempts)
- Animations beyond basic motion entrance
- Mobile-specific layouts (responsive via existing Tailwind, no special mobile work)
