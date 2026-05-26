# Debrief Quiz UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an exam-style quiz UI inside the lesson material tabs that activates on debrief, renders AI-generated questions one at a time with immediate grading, and shows a score report at the end.

**Architecture:** Controlled Base UI Tabs via a Jotai atom. Debrief trigger sets the quiz tab active and scrolls to it. Presentational components for question cards, evaluation cards, and score report. A container component reads atoms and orchestrates the flow. Auto-save on completion, retake regenerates fresh questions.

**Tech Stack:** React, Jotai, Base UI (Tabs, Collapsible), Tailwind CSS, Lucide icons, Motion (entrance animations)

---

## File Map

```
MODIFY  src/atoms/lesson-ai-test.ts                         — add activeTabAtom
MODIFY  src/hooks/data/use-lesson-ai-test.ts                — add useActiveTab, useResetTest hooks
MODIFY  src/components/lesson-material/lesson-material.tsx   — controlled tabs, pass tabsRef
MODIFY  src/components/lesson-material/lesson-material-wrapper.tsx — pass tabsRef down
MODIFY  src/components/lesson-main/parts/lesson-player-container.tsx — set tab + scroll on debrief
CREATE  src/components/lesson-material/parts/debrief-quiz-container.tsx — container: flow orchestration
CREATE  src/components/lesson-material/parts/question-card.tsx  — presentational: one question + input
CREATE  src/components/lesson-material/parts/evaluation-card.tsx — presentational: graded result
CREATE  src/components/lesson-material/parts/score-report.tsx  — presentational: summary + review
CREATE  src/components/lesson-material/parts/score-ring.tsx    — presentational: circular progress SVG
```

---

### Task 1: Add `activeTabAtom` and new hooks

**Files:**
- Modify: `src/atoms/lesson-ai-test.ts`
- Modify: `src/hooks/data/use-lesson-ai-test.ts`

- [ ] **Step 1: Add `activeTabAtom` to atoms file**

Add at the end of `src/atoms/lesson-ai-test.ts`:

```ts
export const activeTabAtom = atom("keyPoints");
```

- [ ] **Step 2: Add `useActiveTab` and `useResetTest` to hooks**

Add to `src/hooks/data/use-lesson-ai-test.ts`:

```ts
import { activeTabAtom } from "#/atoms/lesson-ai-test";

// After existing read hooks:
export const useActiveTab = () => useAtom(activeTabAtom);
```

Also add `useAtom` to the `jotai` import at the top:

```ts
import { useAtomValue, useSetAtom, useAtom } from "jotai";
```

Add a `useResetTest` hook for the retake flow:

```ts
export function useResetTest() {
  const setTest = useSetAtom(currentTestAtom);
  const setIndex = useSetAtom(currentQuestionIndexAtom);
  const setEvaluations = useSetAtom(evaluationsAtom);

  return useCallback(() => {
    setTest(null);
    setIndex(0);
    setEvaluations([]);
  }, [setTest, setIndex, setEvaluations]);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/atoms/lesson-ai-test.ts src/hooks/data/use-lesson-ai-test.ts
git commit -m "feat(state): add activeTabAtom and useResetTest hook"
```

---

### Task 2: Make tabs controlled + scroll ref

**Files:**
- Modify: `src/components/lesson-material/lesson-material.tsx`
- Modify: `src/components/lesson-material/lesson-material-wrapper.tsx`

- [ ] **Step 1: Convert `LessonMaterialView` to controlled tabs**

Replace the entire `src/components/lesson-material/lesson-material.tsx` with:

```tsx
import type { RefObject } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ScrollArea } from "#/components/scroll-area";
import type { LessonMaterial } from "#/db/lesson";
import { useActiveTab, useCurrentTest } from "#/hooks/data/use-lesson-ai-test";
import { Assignments } from "./parts/assignments";
import { DebriefQuizContainer } from "./parts/debrief-quiz-container";
import { JobOfTheDay } from "./parts/job-of-the-day";
import { KeyPoints } from "./parts/key-points";
import { Links } from "./parts/links";
import { ProTips } from "./parts/pro-tips";

type LessonMaterialTab =
  | "keyPoints"
  | "quiz"
  | "proTips"
  | "links"
  | "assignments"
  | "jobOfTheDay";

type TabConfig = {
  value: LessonMaterialTab;
  label: string;
};

const TABS: readonly TabConfig[] = [
  { value: "keyPoints", label: "Key Points" },
  { value: "quiz", label: "Quiz" },
  { value: "proTips", label: "Pro Tips" },
  { value: "links", label: "Links" },
  { value: "assignments", label: "Assignments" },
  { value: "jobOfTheDay", label: "Job of the Day" },
] as const;

type LessonMaterialProps = {
  material: NonNullable<LessonMaterial>;
  tabsRef?: RefObject<HTMLDivElement | null>;
};

export const LessonMaterialView = ({
  material,
  tabsRef,
}: LessonMaterialProps) => {
  const [activeTab, setActiveTab] = useActiveTab();
  const currentTest = useCurrentTest();

  return (
    <Tabs.Root
      ref={tabsRef}
      value={activeTab}
      onValueChange={(val) => setActiveTab(val as string)}
      className="flex flex-col gap-4"
    >
      <ScrollArea
        orientation="horizontal"
        className="lesson-material-tabs-scroll w-full border-b border-gray-6"
      >
        <Tabs.List className="relative z-0 flex w-max gap-1 px-1">
          {TABS.map((tab) => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              className="flex h-9 items-center justify-center px-3 text-sm font-medium text-gray-11 outline-hidden select-none whitespace-nowrap hover:text-gray-12 data-selected:text-gray-12"
            >
              {tab.label}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className="absolute bottom-0 left-0 h-px w-(--active-tab-width) translate-x-(--active-tab-left) bg-gray-12 transition-all duration-200 ease-in-out" />
        </Tabs.List>
      </ScrollArea>

      <Tabs.Panel value="keyPoints" className="outline-hidden">
        <KeyPoints points={material.keyPoints} />
      </Tabs.Panel>

      <Tabs.Panel value="quiz" className="outline-hidden">
        {currentTest ? (
          <DebriefQuizContainer
            lessonSlug={material.lessonSlug}
            material={material}
          />
        ) : (
          <pre className="text-sm text-gray-11">
            {JSON.stringify(material.quiz, null, 2)}
          </pre>
        )}
      </Tabs.Panel>

      <Tabs.Panel value="proTips" className="outline-hidden">
        <ProTips proTips={material.proTips} />
      </Tabs.Panel>

      <Tabs.Panel value="links" className="outline-hidden">
        <Links links={material.links} />
      </Tabs.Panel>

      <Tabs.Panel value="assignments" className="outline-hidden">
        <Assignments assignments={material.assignments} />
      </Tabs.Panel>

      <Tabs.Panel value="jobOfTheDay" className="outline-hidden">
        <JobOfTheDay jobOfTheDay={material.jobOfTheDay} />
      </Tabs.Panel>
    </Tabs.Root>
  );
};
```

- [ ] **Step 2: Pass `tabsRef` from wrapper**

Replace `src/components/lesson-material/lesson-material-wrapper.tsx` with:

```tsx
import { useRef } from "react";
import { useLessonMaterial } from "#/hooks/data/use-lesson-material";
import { LessonMaterialView } from "./lesson-material";
import { LessonMaterialSkeleton } from "./lesson-material-skeleton";

type LessonMaterialWrapperProps = {
  lessonSlug: string;
};

export const lessonMaterialRef = { current: null as HTMLDivElement | null };

export const LessonMaterialWrapper = ({
  lessonSlug,
}: LessonMaterialWrapperProps) => {
  const { data, isLoading, isError } = useLessonMaterial(lessonSlug);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Expose ref for external scroll-to (debrief trigger)
  lessonMaterialRef.current = tabsRef.current;

  if (isLoading) return <LessonMaterialSkeleton />;
  if (isError || !data) return null;

  return <LessonMaterialView material={data} tabsRef={tabsRef} />;
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/lesson-material/lesson-material.tsx src/components/lesson-material/lesson-material-wrapper.tsx
git commit -m "feat(tabs): make lesson material tabs controlled via Jotai atom"
```

---

### Task 3: Wire debrief trigger to tab + scroll

**Files:**
- Modify: `src/components/lesson-main/parts/lesson-player-container.tsx`

- [ ] **Step 1: Update `LessonPlayerContainer` to set tab + scroll on debrief**

Replace `src/components/lesson-main/parts/lesson-player-container.tsx` with:

```tsx
import { useAtom, useSetAtom } from "jotai";
import { atom } from "jotai";
import { useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { VideoPlayerContainer } from "#/components/video-player";
import { DebriefOverlay } from "#/components/video-player/parts/debrief-overlay";
import { lessonMaterialRef } from "#/components/lesson-material/lesson-material-wrapper";
import { activeTabAtom } from "#/atoms/lesson-ai-test";
import { useLessonMaterial } from "#/hooks/data/use-lesson-material";
import {
  useGenerateTest,
  useIsGenerating,
  useCurrentTest,
} from "#/hooks/data/use-lesson-ai-test";
import type { VideoFetchState } from "../types";

const videoEndedAtom = atom(false);

type LessonPlayerContainerProps = {
  videoState: Extract<VideoFetchState, { status: "ready" }>;
  lessonSlug: string;
};

export const LessonPlayerContainer = ({
  videoState,
  lessonSlug,
}: LessonPlayerContainerProps) => {
  const [videoEnded, setVideoEnded] = useAtom(videoEndedAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const isGenerating = useIsGenerating();
  const currentTest = useCurrentTest();
  const generateTest = useGenerateTest();
  const { data: material } = useLessonMaterial(lessonSlug);

  const onEnded = useCallback(() => {
    setVideoEnded(true);
  }, [setVideoEnded]);

  const onDebrief = useCallback(async () => {
    if (!material?.keyPoints?.length || !material?.text) return;
    const test = await generateTest(lessonSlug, material.keyPoints, material.text);
    if (test) {
      setActiveTab("quiz");
      queueMicrotask(() => {
        lessonMaterialRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [generateTest, lessonSlug, material, setActiveTab]);

  const showDebrief = videoEnded && !currentTest;

  return (
    <VideoPlayerContainer
      src={videoState.src}
      poster={videoState.poster}
      tracks={videoState.tracks}
      onEnded={onEnded}
      overlay={
        <AnimatePresence>
          {showDebrief ? (
            <DebriefOverlay loading={isGenerating} onDebrief={onDebrief} />
          ) : null}
        </AnimatePresence>
      }
    />
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson-main/parts/lesson-player-container.tsx
git commit -m "feat(debrief): activate quiz tab and scroll on debrief"
```

---

### Task 4: ScoreRing component

**Files:**
- Create: `src/components/lesson-material/parts/score-ring.tsx`

- [ ] **Step 1: Create the SVG progress ring**

Create `src/components/lesson-material/parts/score-ring.tsx`:

```tsx
type ScoreRingProps = {
  score: number;
  size?: number;
  strokeWidth?: number;
};

export const ScoreRing = ({
  score,
  size = 80,
  strokeWidth = 6,
}: ScoreRingProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80
      ? "var(--color-green-9, #30a46c)"
      : score >= 50
        ? "var(--color-amber-9, #f5a623)"
        : "var(--color-red-9, #e5484d)";

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ inlineSize: size, blockSize: size }}
      role="img"
      aria-label={`Score: ${score}%`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ inlineSize: size, blockSize: size }}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-gray-4)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
        />
      </svg>
      <span className="absolute text-lg font-bold text-gray-12">
        {score}%
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson-material/parts/score-ring.tsx
git commit -m "feat(ui): add ScoreRing circular progress component"
```

---

### Task 5: QuestionCard component

**Files:**
- Create: `src/components/lesson-material/parts/question-card.tsx`

- [ ] **Step 1: Create the QuestionCard presentational component**

Create `src/components/lesson-material/parts/question-card.tsx`:

```tsx
import { atom, useAtom } from "jotai";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type {
  AITestMCQQuestion,
  AITestFreeTextQuestion,
  AITestQuestion,
} from "#/ai/schemas";

const selectedOptionAtom = atom("");
const freeTextAnswerAtom = atom("");

type QuestionCardProps = {
  question: AITestQuestion;
  index: number;
  total: number;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
};

export const QuestionCard = ({
  question,
  index,
  total,
  isEvaluating,
  onSubmit,
}: QuestionCardProps) => {
  const reduced = useReducedMotion();

  return (
    <motion.div
      key={question.id}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4 rounded-lg border border-gray-6 bg-gray-2 p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-11">
          {index + 1} of {total}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-gray-12">
        {question.question}
      </p>

      {question.type === "mcq" ? (
        <MCQInput
          question={question}
          isEvaluating={isEvaluating}
          onSubmit={onSubmit}
        />
      ) : (
        <FreeTextInput
          question={question}
          isEvaluating={isEvaluating}
          onSubmit={onSubmit}
        />
      )}
    </motion.div>
  );
};

type MCQInputProps = {
  question: AITestMCQQuestion;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
};

const MCQInput = ({ question, isEvaluating, onSubmit }: MCQInputProps) => {
  const [selected, setSelected] = useAtom(selectedOptionAtom);

  return (
    <>
      <fieldset className="flex flex-col gap-2" disabled={isEvaluating}>
        {question.options.map((opt) => (
          <label
            key={opt.id}
            className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
              selected === opt.id
                ? "border-accent-9 bg-accent-3 text-gray-12"
                : "border-gray-6 bg-gray-1 text-gray-11 hover:border-gray-7 hover:text-gray-12"
            }`}
          >
            <input
              type="radio"
              name={question.id}
              value={opt.id}
              checked={selected === opt.id}
              onChange={() => setSelected(opt.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                selected === opt.id
                  ? "border-accent-9 bg-accent-9"
                  : "border-gray-7"
              }`}
            >
              {selected === opt.id && (
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </span>
            {opt.value}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        disabled={!selected || isEvaluating}
        onClick={() => onSubmit(selected)}
        className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isEvaluating && <Loader2 size={14} className="animate-spin" />}
        Submit
      </button>
    </>
  );
};

type FreeTextInputProps = {
  question: AITestFreeTextQuestion;
  isEvaluating: boolean;
  onSubmit: (answer: string) => void;
};

const FreeTextInput = ({
  question: _question,
  isEvaluating,
  onSubmit,
}: FreeTextInputProps) => {
  const [answer, setAnswer] = useAtom(freeTextAnswerAtom);

  return (
    <>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={isEvaluating}
        placeholder="Type your answer..."
        rows={4}
        className="w-full resize-none rounded-md border border-gray-6 bg-gray-1 p-3 text-sm text-gray-12 placeholder:text-gray-8 focus:border-accent-9 focus:outline-hidden disabled:opacity-50"
      />

      <button
        type="button"
        disabled={!answer.trim() || isEvaluating}
        onClick={() => onSubmit(answer.trim())}
        className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isEvaluating && <Loader2 size={14} className="animate-spin" />}
        Submit
      </button>
    </>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson-material/parts/question-card.tsx
git commit -m "feat(ui): add QuestionCard with MCQ radio and free-text input"
```

---

### Task 6: EvaluationCard component

**Files:**
- Create: `src/components/lesson-material/parts/evaluation-card.tsx`

- [ ] **Step 1: Create the EvaluationCard presentational component**

Create `src/components/lesson-material/parts/evaluation-card.tsx`:

```tsx
import { Check, X, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type {
  AITestQuestion,
  AITestMCQQuestion,
  AIEvaluationResult,
} from "#/ai/schemas";

type EvaluationCardProps = {
  question: AITestQuestion;
  evaluation: AIEvaluationResult;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
};

const scoreBadgeColor = (score: number) =>
  score >= 80
    ? "bg-green-3 text-green-11 border-green-7"
    : score >= 50
      ? "bg-amber-3 text-amber-11 border-amber-7"
      : "bg-red-3 text-red-11 border-red-7";

export const EvaluationCard = ({
  question,
  evaluation,
  index,
  total,
  isLast,
  onNext,
}: EvaluationCardProps) => {
  const reduced = useReducedMotion();

  return (
    <motion.div
      key={`eval-${question.id}`}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4 rounded-lg border border-gray-6 bg-gray-2 p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-11">
          {index + 1} of {total}
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreBadgeColor(evaluation.score)}`}
        >
          {evaluation.score}/100
        </span>
      </div>

      <p className="text-sm leading-relaxed text-gray-12">
        {question.question}
      </p>

      {question.type === "mcq" ? (
        <MCQResult
          question={question as AITestMCQQuestion}
          userAnswer={evaluation.userAnswer}
        />
      ) : (
        <FreeTextResult userAnswer={evaluation.userAnswer} />
      )}

      <div className="rounded-md border border-gray-6 bg-gray-1 p-3">
        <p className="text-xs font-medium text-gray-11 mb-1">Explanation</p>
        <p className="text-sm leading-relaxed text-gray-12">
          {evaluation.explanation}
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="ms-auto inline-flex items-center gap-2 rounded-md bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-10"
      >
        {isLast ? "See Results" : "Next"}
        <ArrowRight size={14} />
      </button>
    </motion.div>
  );
};

const MCQResult = ({
  question,
  userAnswer,
}: {
  question: AITestMCQQuestion;
  userAnswer: string;
}) => {
  const isCorrect = userAnswer === question.correctOptionId;

  return (
    <div className="flex flex-col gap-2">
      {question.options.map((opt) => {
        const isUserPick = opt.id === userAnswer;
        const isCorrectOption = opt.id === question.correctOptionId;

        let style = "border-gray-6 bg-gray-1 text-gray-9";
        if (isCorrectOption) {
          style = "border-green-7 bg-green-3 text-green-11";
        } else if (isUserPick && !isCorrect) {
          style = "border-red-7 bg-red-3 text-red-11";
        }

        return (
          <div
            key={opt.id}
            className={`flex items-center gap-3 rounded-md border p-3 text-sm ${style}`}
          >
            {isCorrectOption && <Check size={14} className="shrink-0" />}
            {isUserPick && !isCorrect && (
              <X size={14} className="shrink-0" />
            )}
            {!isCorrectOption && !(isUserPick && !isCorrect) && (
              <span className="inline-block w-3.5 shrink-0" />
            )}
            {opt.value}
          </div>
        );
      })}
    </div>
  );
};

const FreeTextResult = ({ userAnswer }: { userAnswer: string }) => (
  <div className="rounded-md border border-gray-6 bg-gray-1 p-3">
    <p className="text-xs font-medium text-gray-11 mb-1">Your answer</p>
    <p className="text-sm leading-relaxed text-gray-12 italic">{userAnswer}</p>
  </div>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson-material/parts/evaluation-card.tsx
git commit -m "feat(ui): add EvaluationCard with MCQ/free-text result display"
```

---

### Task 7: ScoreReport component

**Files:**
- Create: `src/components/lesson-material/parts/score-report.tsx`

- [ ] **Step 1: Create the ScoreReport presentational component**

Create `src/components/lesson-material/parts/score-report.tsx`:

```tsx
import { Collapsible } from "@base-ui/react/Collapsible";
import { ChevronDown, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { AITestQuestion, AIEvaluationResult } from "#/ai/schemas";
import { ScoreRing } from "./score-ring";

type ScoreReportProps = {
  score: number;
  questions: AITestQuestion[];
  evaluations: AIEvaluationResult[];
  onRetake: () => void;
};

const gradeLabel = (score: number) => {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Review";
  return "Keep Practicing";
};

const scoreBadgeColor = (score: number) =>
  score >= 80
    ? "bg-green-3 text-green-11 border-green-7"
    : score >= 50
      ? "bg-amber-3 text-amber-11 border-amber-7"
      : "bg-red-3 text-red-11 border-red-7";

export const ScoreReport = ({
  score,
  questions,
  evaluations,
  onRetake,
}: ScoreReportProps) => {
  const reduced = useReducedMotion();
  const passedCount = evaluations.filter((e) => e.score >= 70).length;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 p-6">
        <ScoreRing score={score} />
        <h3 className="text-lg font-semibold text-gray-12">
          {gradeLabel(score)}
        </h3>
        <p className="text-sm text-gray-11">
          {passedCount} of {questions.length} questions correct
        </p>
        <button
          type="button"
          onClick={onRetake}
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-gray-6 bg-gray-1 px-4 py-2 text-sm font-medium text-gray-12 hover:bg-gray-3"
        >
          <RotateCcw size={14} />
          Retake
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-gray-11">Question Review</h4>
        {questions.map((q, i) => {
          const evalResult = evaluations.find((e) => e.questionId === q.id);
          if (!evalResult) return null;

          return (
            <Collapsible.Root key={q.id}>
              <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-md border border-gray-6 bg-gray-2 p-3 text-start hover:bg-gray-3 group">
                <span className="text-xs font-semibold text-gray-11 tabular-nums shrink-0">
                  Q{i + 1}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums shrink-0 ${scoreBadgeColor(evalResult.score)}`}
                >
                  {evalResult.score}
                </span>
                <span className="flex-1 truncate text-sm text-gray-12">
                  {q.question.slice(0, 80)}
                  {q.question.length > 80 ? "…" : ""}
                </span>
                <ChevronDown
                  size={14}
                  className="shrink-0 text-gray-11 transition-transform group-data-[open]:rotate-180"
                />
              </Collapsible.Trigger>
              <Collapsible.Panel className="overflow-hidden rounded-b-md border-x border-b border-gray-6 bg-gray-1 p-4">
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-gray-12">
                    {q.question}
                  </p>
                  <div>
                    <p className="text-xs font-medium text-gray-11">
                      Your answer
                    </p>
                    <p className="text-sm text-gray-12 mt-0.5">
                      {q.type === "mcq"
                        ? q.options.find(
                            (o) => o.id === evalResult.userAnswer,
                          )?.value ?? evalResult.userAnswer
                        : evalResult.userAnswer}
                    </p>
                  </div>
                  {q.type === "mcq" && (
                    <div>
                      <p className="text-xs font-medium text-gray-11">
                        Correct answer
                      </p>
                      <p className="text-sm text-green-11 mt-0.5">
                        {q.options.find((o) => o.id === q.correctOptionId)
                          ?.value ?? q.correctOptionId}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-gray-11">
                      Explanation
                    </p>
                    <p className="text-sm text-gray-12 mt-0.5 leading-relaxed">
                      {evalResult.explanation}
                    </p>
                  </div>
                </div>
              </Collapsible.Panel>
            </Collapsible.Root>
          );
        })}
      </div>
    </motion.div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/lesson-material/parts/score-report.tsx
git commit -m "feat(ui): add ScoreReport with progress ring and expandable review"
```

---

### Task 8: DebriefQuizContainer

**Files:**
- Create: `src/components/lesson-material/parts/debrief-quiz-container.tsx`

- [ ] **Step 1: Create the container component**

Create `src/components/lesson-material/parts/debrief-quiz-container.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import type { LessonMaterial } from "#/db/lesson";
import {
  useCurrentTest,
  useCurrentQuestion,
  useCurrentQuestionIndex,
  useEvaluations,
  useIsEvaluating,
  useTotalScore,
  useEvaluateAnswer,
  useAdvanceQuestion,
  useSaveResults,
  useResetTest,
  useGenerateTest,
} from "#/hooks/data/use-lesson-ai-test";
import { selectedOptionAtom, freeTextAnswerAtom } from "./question-card";
import { QuestionCard } from "./question-card";
import { EvaluationCard } from "./evaluation-card";
import { ScoreReport } from "./score-report";

type DebriefQuizContainerProps = {
  lessonSlug: string;
  material: NonNullable<LessonMaterial>;
};

export const DebriefQuizContainer = ({
  lessonSlug,
  material,
}: DebriefQuizContainerProps) => {
  const test = useCurrentTest();
  const currentQuestion = useCurrentQuestion();
  const questionIndex = useCurrentQuestionIndex();
  const evaluations = useEvaluations();
  const isEvaluating = useIsEvaluating();
  const totalScore = useTotalScore();
  const evaluateAnswer = useEvaluateAnswer();
  const advanceQuestion = useAdvanceQuestion();
  const saveResults = useSaveResults();
  const resetTest = useResetTest();
  const generateTest = useGenerateTest();
  const setSelectedOption = useSetAtom(selectedOptionAtom);
  const setFreeTextAnswer = useSetAtom(freeTextAnswerAtom);
  const savedRef = useRef(false);

  const isComplete =
    test !== null && evaluations.length === test.questions.length;
  const currentEvaluation = currentQuestion
    ? evaluations.find((e) => e.questionId === currentQuestion.id)
    : null;

  // Auto-save when test completes
  useEffect(() => {
    if (isComplete && !savedRef.current) {
      savedRef.current = true;
      saveResults().catch(console.error);
    }
  }, [isComplete, saveResults]);

  if (!test) return null;

  if (isComplete) {
    return (
      <ScoreReport
        score={totalScore}
        questions={test.questions}
        evaluations={evaluations}
        onRetake={async () => {
          savedRef.current = false;
          resetTest();
          if (material.keyPoints?.length && material.text) {
            await generateTest(
              lessonSlug,
              material.keyPoints,
              material.text,
            );
          }
        }}
      />
    );
  }

  if (!currentQuestion) return null;

  const handleSubmit = async (answer: string) => {
    if (!material.keyPoints || !material.text) return;
    await evaluateAnswer(
      currentQuestion,
      answer,
      material.keyPoints,
      material.text,
    );
  };

  const handleNext = () => {
    setSelectedOption("");
    setFreeTextAnswer("");
    advanceQuestion((prev) => prev + 1);
  };

  if (currentEvaluation) {
    return (
      <EvaluationCard
        question={currentQuestion}
        evaluation={currentEvaluation}
        index={questionIndex}
        total={test.questions.length}
        isLast={questionIndex === test.questions.length - 1}
        onNext={handleNext}
      />
    );
  }

  return (
    <QuestionCard
      question={currentQuestion}
      index={questionIndex}
      total={test.questions.length}
      isEvaluating={isEvaluating}
      onSubmit={handleSubmit}
    />
  );
};
```

- [ ] **Step 2: Export the answer atoms from question-card for the container**

Update `src/components/lesson-material/parts/question-card.tsx` — change the atom declarations to be exported:

```ts
export const selectedOptionAtom = atom("");
export const freeTextAnswerAtom = atom("");
```

- [ ] **Step 3: Commit**

```bash
git add src/components/lesson-material/parts/debrief-quiz-container.tsx src/components/lesson-material/parts/question-card.tsx
git commit -m "feat(ui): add DebriefQuizContainer orchestrating quiz flow"
```

---

### Task 9: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Expected: No new type errors (only pre-existing auth.ts warnings).

- [ ] **Step 2: Run all tests**

```bash
pnpm vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Run the dev server and test manually**

```bash
pnpm dev
```

Test flow:
1. Navigate to a lesson with a video
2. Watch video to completion (or seek to end)
3. "Debrief" overlay should appear on video
4. Tap Debrief — quiz tab should activate, page scrolls to tabs
5. Answer a question (MCQ or free-text), tap Submit
6. Evaluation card shows with score + explanation
7. Tap Next to advance through all questions
8. Score report shows at the end with expandable review
9. Retake button generates fresh questions

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from debrief quiz UI integration"
```

Only if Steps 1-3 surfaced issues. Skip if everything works.
