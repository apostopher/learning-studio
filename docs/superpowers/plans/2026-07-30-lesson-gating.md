# Lesson Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock a lesson's video and material until the student has satisfied its module prerequisites, its lesson prerequisites, and watched its own video — enforced on the server, explained in the UI.

**Architecture:** One pure predicate in `src/lib/lesson-gating.ts` is the single source of truth. The server imports it to *enforce* (material route, video route, AI chat context); the client imports it to *explain* (sidebar locks, lesson page, material panel). Per-user data never enters the Redis-cached course payload. The anti-skip guarantee lives in the milestone reporter, which reports only milestones crossed by real playback.

**Tech Stack:** TanStack Start (file routes), Drizzle + Postgres, TanStack Query, Jotai, Base UI, Tailwind, Vitest, Zod, Biome.

**Spec:** `docs/superpowers/specs/2026-07-30-lesson-gating-ledger.md` — 27 confirmed decisions. Read it before starting; every task below traces to a numbered decision.

## Global Constraints

- **Import alias is `#/`, not `@/`.** Vitest cannot resolve `@/`. New files and new imports use `#/`. Do not "fix" existing `@/` imports in files you touch.
- **Presentational components must be hookless.** react-compiler + vitest nulls the React dispatcher, so a presentational component that calls any hook cannot be render-tested. State and hooks live in `*-container.tsx`.
- **No `jest-dom`.** Assert with plain DOM (`textContent`, `getAttribute`, `querySelector`).
- **Kebab-case filenames, PascalCase exports.**
- **Logical CSS properties only** (`ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`/`text-start`), never `ml-*`/`left-*`/`text-left`.
- **Colors come from the semantic token layer** (`text-primary`, `text-secondary`, `bg-gray-a3`, `border-gray-6`, …). No hex, no Tailwind palette classes.
- **Tests assert on what the consumer received**, not that a value exists in state (project CLAUDE.md). Capture the collaborator with `vi.fn()` and assert on its call arguments.
- **Every regression test must be verified red first.** Where a step says "run to verify it fails", that is mandatory, not decorative.
- **Server route tests** use `// @vitest-environment node`, `vi.hoisted` for mock fns, `vi.mock('#/lib/auth', …)`, and call the exported handler directly. Pattern: `src/routes/api/lesson/__tests__/video.test.ts`.
- **Never stage** `src/db/schema.ts`, `package.json`, or `CLAUDE.md` unless the task explicitly changes them. Use explicit paths in `git add`.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## File Structure

**Create**
- `src/lib/lesson-gating.ts` — pure predicate + response types (shared server/client)
- `src/lib/__tests__/lesson-gating.test.ts`
- `src/lib/lesson-gating.server.ts` — assembles gate inputs from the DB
- `src/lib/__tests__/lesson-gating-server.test.ts`
- `src/db/lesson-access.ts` — `getCourseSlugForLesson`, `isSubscribedToCourse`, `getLessonByVideoId`
- `src/components/lesson-material/parts/material-locked.tsx`
- `src/components/lesson-main/parts/lesson-locked.tsx`
- `src/components/video-player/parts/coverage-notice.tsx`
- `src/components/sidebar/lesson-lock-icon.tsx`
- plus test files named in each task

**Modify**
- `src/db/course.ts:154-170` — delete synthetic deps, apply filter + sort
- `src/lib/course-milestones.ts` — add `crossedMilestones`, `SEEK_THRESHOLD_SECONDS`
- `src/components/video-player/use-milestone-reporter.ts` — crossing + seed + reconcile
- `src/routes/api/lesson/material.ts` — auth, subscription, gates
- `src/routes/api/lesson/video.ts` — gates
- `src/db/course-content.ts` — gate-filtered agent content
- `src/ai/tools/search-kb.ts`, `src/ai/chat.ts` — thread `courseSlug` + `userId`
- `src/atoms/lesson-material.ts` — locked-aware `staleTime`
- `src/components/lesson-material/lesson-material-wrapper.tsx`
- `src/components/lesson-main/types.ts`, `compute-lesson-main-state.ts`, `lesson-main.tsx`, `lesson-main-wrapper.tsx`
- `src/components/lesson-main/parts/lesson-player-container.tsx`
- `src/components/sidebar/course-sidebar-wrapper.tsx`, `course-sidebar.tsx`, `module-accordion.tsx`, `module-item.tsx`, `lesson-list.tsx`, `lesson-link.tsx`

---

### Task 1: The pure gating predicate

**Files:**
- Create: `src/lib/lesson-gating.ts`
- Test: `src/lib/__tests__/lesson-gating.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module, no DB/React/network imports)
- Produces: `GateLesson`, `GateModule`, `GateCourse`, `LessonLock`, `MaterialLock`, `LockedMaterialResponse`, `LessonMaterialResponse<T>`, `isLessonSatisfied`, `evaluateLessonLock`, `evaluateMaterialLock`, `lockedResponse`

Implements decisions 1, 2, 4, 22, 23, 25, 26.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/lesson-gating.test.ts
import { describe, expect, it } from 'vitest';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  isLessonSatisfied,
  lockedResponse,
  type GateCourse,
  type GateLesson,
} from '#/lib/lesson-gating';

const lesson = (over: Partial<GateLesson> = {}): GateLesson => ({
  slug: 'l1',
  name: 'Lesson One',
  isAvailable: true,
  videoId: 'vid-1',
  needsVideoWatch: true,
  dependsOn: [],
  ...over,
});

const course = (modules: GateCourse['modules']): GateCourse => ({ modules });

describe('isLessonSatisfied', () => {
  it('is satisfied once the video is watched', () => {
    expect(isLessonSatisfied(lesson(), new Set(['l1']))).toBe(true);
    expect(isLessonSatisfied(lesson(), new Set())).toBe(false);
  });

  it('is satisfied when the lesson has no video', () => {
    // 20 lessons carry needsVideoWatch: true with no video, and the column
    // defaults to true — a hard block would strand them permanently.
    expect(isLessonSatisfied(lesson({ videoId: null }), new Set())).toBe(true);
  });

  it('is satisfied when watching is not required', () => {
    expect(isLessonSatisfied(lesson({ needsVideoWatch: false }), new Set())).toBe(true);
  });

  it('is satisfied when the lesson is unavailable (WIP)', () => {
    expect(isLessonSatisfied(lesson({ isAvailable: false }), new Set())).toBe(true);
  });
});

describe('evaluateLessonLock', () => {
  const twoModules = course([
    { slug: 'm1', name: 'Module One', dependsOn: [], lessons: [lesson({ slug: 'a', name: 'A' })] },
    {
      slug: 'm2',
      name: 'Module Two',
      dependsOn: ['m1'],
      lessons: [lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a', moduleSlug: 'm1' }] })],
    },
  ]);

  it('locks on the module gate before the lesson gate', () => {
    expect(evaluateLessonLock(twoModules, 'b', new Set())).toEqual({
      kind: 'module-locked',
      moduleSlug: 'm1',
      moduleName: 'Module One',
    });
  });

  it('opens once every available lesson of the prerequisite module is satisfied', () => {
    expect(evaluateLessonLock(twoModules, 'b', new Set(['a']))).toEqual({ kind: 'open' });
  });

  it('names the blocking lesson when only the lesson gate fails', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        lessons: [
          lesson({ slug: 'a', name: 'A' }),
          lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a' }] }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set())).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
    });
  });

  it('ignores a prerequisite that is unavailable', () => {
    // swiss-cheese depends on personal-accountability, which is is_available
    // false — a student can never reach it, so it must not block.
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        lessons: [
          lesson({ slug: 'a', name: 'A', isAvailable: false }),
          lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a' }] }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set())).toEqual({ kind: 'open' });
  });

  it('ignores a prerequisite lesson or module that does not exist', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: ['gone'],
        lessons: [lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'missing' }] })],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set())).toEqual({ kind: 'open' });
  });

  it('resolves a same-module dependency with no moduleSlug', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        lessons: [
          lesson({ slug: 'a', name: 'A' }),
          lesson({ slug: 'b', name: 'B', dependsOn: [{ lessonSlug: 'a' }] }),
        ],
      },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set(['a']))).toEqual({ kind: 'open' });
  });

  it('ignores unavailable lessons when judging a prerequisite module', () => {
    const c = course([
      {
        slug: 'm1',
        name: 'Module One',
        dependsOn: [],
        lessons: [lesson({ slug: 'a', name: 'A' }), lesson({ slug: 'wip', name: 'WIP', isAvailable: false })],
      },
      { slug: 'm2', name: 'Module Two', dependsOn: ['m1'], lessons: [lesson({ slug: 'b', name: 'B' })] },
    ]);
    expect(evaluateLessonLock(c, 'b', new Set(['a']))).toEqual({ kind: 'open' });
  });
});

describe('evaluateMaterialLock', () => {
  const c = course([
    { slug: 'm1', name: 'Module One', dependsOn: [], lessons: [lesson({ slug: 'a', name: 'A' })] },
  ]);

  it('locks material until the lesson video is watched', () => {
    expect(evaluateMaterialLock(c, 'a', new Set())).toEqual({ kind: 'video-locked' });
    expect(evaluateMaterialLock(c, 'a', new Set(['a']))).toEqual({ kind: 'open' });
  });
});

describe('lockedResponse', () => {
  it('reports the module gate as the reason', () => {
    expect(
      lockedResponse({ kind: 'module-locked', moduleSlug: 'm1', moduleName: 'M' }, { kind: 'open' }),
    ).toEqual({ locked: true, reason: 'module', blockedBy: { moduleSlug: 'm1', moduleName: 'M' } });
  });

  it('reports the lesson gate as the reason', () => {
    expect(
      lockedResponse(
        { kind: 'lesson-locked', lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
        { kind: 'open' },
      ),
    ).toEqual({
      locked: true,
      reason: 'lesson',
      blockedBy: { lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
    });
  });

  it('reports the video gate only when the lesson itself is open', () => {
    expect(lockedResponse({ kind: 'open' }, { kind: 'video-locked' })).toEqual({
      locked: true,
      reason: 'video',
    });
  });

  it('returns null when nothing is locked', () => {
    expect(lockedResponse({ kind: 'open' }, { kind: 'open' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/lesson-gating.test.ts`
Expected: FAIL — `Failed to resolve import "#/lib/lesson-gating"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/lesson-gating.ts
/**
 * Pure lesson-gating predicate. The single source of truth for three gates:
 * module prerequisites, lesson prerequisites, and the lesson's own video.
 *
 * The server imports this to ENFORCE; the client imports it to EXPLAIN. They
 * must never disagree, so this file has no DB, network, or React dependency.
 * See docs/superpowers/specs/2026-07-30-lesson-gating-ledger.md.
 *
 * Admin bypass is deliberately NOT modelled here — callers skip the predicate
 * entirely for admins, so this stays a pure statement about student progress.
 */

export type GateLessonDependency = {
  lessonSlug: string;
  /** Absent when the prerequisite sits in the same module as its dependent. */
  moduleSlug?: string;
};

export type GateLesson = {
  slug: string;
  name: string;
  isAvailable: boolean;
  videoId: string | null;
  needsVideoWatch: boolean;
  dependsOn: readonly GateLessonDependency[];
};

export type GateModule = {
  slug: string;
  name: string;
  /** Slugs of modules that must be finished before this one opens. */
  dependsOn: readonly string[];
  lessons: readonly GateLesson[];
};

export type GateCourse = { modules: readonly GateModule[] };

export type LessonLock =
  | { kind: 'open' }
  | { kind: 'module-locked'; moduleSlug: string; moduleName: string }
  | {
      kind: 'lesson-locked';
      lessonSlug: string;
      moduleSlug: string;
      lessonName: string;
    };

export type MaterialLock = { kind: 'open' } | { kind: 'video-locked' };

export type LockedMaterialResponse =
  | { locked: true; reason: 'video' }
  | {
      locked: true;
      reason: 'lesson';
      blockedBy: { lessonSlug: string; moduleSlug: string; lessonName: string };
    }
  | {
      locked: true;
      reason: 'module';
      blockedBy: { moduleSlug: string; moduleName: string };
    };

/**
 * Content is nested under `material` rather than spread flat, so a locked
 * response CANNOT carry it. With a flat shape, every column added to
 * lesson_material would leak until someone remembered to null it too.
 */
export type LessonMaterialResponse<TMaterial> =
  | { locked: false; adminBypass: boolean; material: TMaterial }
  | LockedMaterialResponse;

const OPEN_LESSON: LessonLock = { kind: 'open' };
const OPEN_MATERIAL: MaterialLock = { kind: 'open' };

/**
 * Whether a lesson's own video requirement is met.
 *
 * Three escapes, all deliberate: an unavailable (WIP) lesson is outside gate
 * logic entirely; a lesson with watching switched off cannot block; and a
 * lesson with no video has nothing to watch — needsVideoWatch defaults to
 * true, so blocking there would strand every video-less lesson forever.
 */
export function isLessonSatisfied(
  lesson: GateLesson,
  watchedLessonSlugs: ReadonlySet<string>,
): boolean {
  if (!lesson.isAvailable) return true;
  if (!lesson.needsVideoWatch) return true;
  if (!lesson.videoId) return true;
  return watchedLessonSlugs.has(lesson.slug);
}

function locate(
  course: GateCourse,
  lessonSlug: string,
): { module: GateModule; lesson: GateLesson } | null {
  for (const module of course.modules) {
    const lesson = module.lessons.find((l) => l.slug === lessonSlug);
    if (lesson) return { module, lesson };
  }
  return null;
}

/**
 * Whether the whole lesson — video AND material — is reachable. Module
 * prerequisites are checked before lesson prerequisites, so the coarsest
 * unmet requirement is the one reported.
 *
 * A prerequisite no student action can satisfy never blocks: a module or
 * lesson that does not exist, or one that is unavailable, is skipped. The
 * dependency graph is edited independently of availability and video
 * assignment, so unsatisfiable edges appear routinely; failing closed on them
 * silently kills whole chains of content.
 *
 * Only direct edges are walked. Transitivity emerges because a locked lesson
 * is unplayable, so its video cannot be watched, so its dependents stay locked.
 */
export function evaluateLessonLock(
  course: GateCourse,
  lessonSlug: string,
  watchedLessonSlugs: ReadonlySet<string>,
): LessonLock {
  const found = locate(course, lessonSlug);
  // An unknown lesson is not this function's error to report — callers 404.
  if (!found) return OPEN_LESSON;
  const { module, lesson } = found;

  for (const prereqSlug of module.dependsOn) {
    const prereq = course.modules.find((m) => m.slug === prereqSlug);
    if (!prereq) continue;
    const satisfied = prereq.lessons
      .filter((l) => l.isAvailable)
      .every((l) => isLessonSatisfied(l, watchedLessonSlugs));
    if (!satisfied) {
      return {
        kind: 'module-locked',
        moduleSlug: prereq.slug,
        moduleName: prereq.name,
      };
    }
  }

  for (const dep of lesson.dependsOn) {
    const depModule = course.modules.find(
      (m) => m.slug === (dep.moduleSlug ?? module.slug),
    );
    if (!depModule) continue;
    const depLesson = depModule.lessons.find((l) => l.slug === dep.lessonSlug);
    if (!depLesson || !depLesson.isAvailable) continue;
    if (!isLessonSatisfied(depLesson, watchedLessonSlugs)) {
      return {
        kind: 'lesson-locked',
        lessonSlug: depLesson.slug,
        moduleSlug: depModule.slug,
        lessonName: depLesson.name,
      };
    }
  }

  return OPEN_LESSON;
}

/**
 * Whether the lesson's material is readable, assuming evaluateLessonLock is
 * already open. The lesson's own video controls this gate and no other.
 */
export function evaluateMaterialLock(
  course: GateCourse,
  lessonSlug: string,
  watchedLessonSlugs: ReadonlySet<string>,
): MaterialLock {
  const found = locate(course, lessonSlug);
  if (!found) return OPEN_MATERIAL;
  return isLessonSatisfied(found.lesson, watchedLessonSlugs)
    ? OPEN_MATERIAL
    : { kind: 'video-locked' };
}

/**
 * The locked response body for a pair of lock states, or null when nothing is
 * locked. Route handlers call this instead of assembling the shape by hand.
 */
export function lockedResponse(
  lessonLock: LessonLock,
  materialLock: MaterialLock,
): LockedMaterialResponse | null {
  if (lessonLock.kind === 'module-locked') {
    return {
      locked: true,
      reason: 'module',
      blockedBy: {
        moduleSlug: lessonLock.moduleSlug,
        moduleName: lessonLock.moduleName,
      },
    };
  }
  if (lessonLock.kind === 'lesson-locked') {
    return {
      locked: true,
      reason: 'lesson',
      blockedBy: {
        lessonSlug: lessonLock.lessonSlug,
        moduleSlug: lessonLock.moduleSlug,
        lessonName: lessonLock.lessonName,
      },
    };
  }
  if (materialLock.kind === 'video-locked') {
    return { locked: true, reason: 'video' };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/lesson-gating.test.ts`
Expected: PASS — 15 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/lesson-gating.ts src/lib/__tests__/lesson-gating.test.ts
git commit -m "feat(gating): add the pure lesson-gating predicate

Single source of truth for the module, lesson, and video gates. An
unsatisfiable prerequisite — missing, or unavailable — never blocks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Delete the demo dependency hack; apply the filter and sort

**Files:**
- Modify: `src/db/course.ts:154-170`
- Test: `src/db/__tests__/course-shaping.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `getCourseDetails` returns `mod.lessons` filtered to `isAvailable` and sorted by `rank` ascending, with no synthetic dependencies

Implements decisions 3, 27, and 28. The block being replaced hard-codes `mod.id > 1 && mod.id < 6`, which was written for 3d-airmanship and now resolves to three ITPS modules; and it computes a filter and sort into a local array that is never assigned back, so 23 WIP lessons currently reach students in join order.

**The admin editor is NOT affected and must not be.** `is_available` is set in the editor, so an editor that hid unavailable lessons could never make one available again. This filter is safe because the two paths do not share a query:

| Path | Source | WIP lessons |
| --- | --- | --- |
| Learner | `getCourseDetails` (`src/db/course.ts`) → `/api/course/details` — its **only** caller | filtered out by this task |
| Admin editor | `getCourseBoard` (`src/db/admin.ts:255-275`) → `/api/admin/courses/$courseId/board` | all lessons, already rank-ordered, untouched |

Do not add an `isAvailable` filter to `src/db/admin.ts` under any circumstances.

- [ ] **Step 1: Extract the shaping logic so it can be tested without a DB**

Add this exported pure function to `src/db/course.ts`, directly above `getCourseDetails`:

```ts
type ShapeableLesson = { id: number; isAvailable: boolean; rank: string };
type ShapeableModule<L extends ShapeableLesson> = { lessons: L[] };

/**
 * Drop WIP lessons and order the rest by rank, in place, for every module.
 *
 * Previously this filter and sort were computed into a local array that was
 * never assigned back, so every `is_available = false` lesson was served to
 * students and modules came back in join order. Exported so the shaping is
 * testable without a database.
 */
export function shapeModuleLessons<
  L extends ShapeableLesson,
  M extends ShapeableModule<L>,
>(modules: Iterable<M>): void {
  for (const mod of modules) {
    mod.lessons = mod.lessons
      .filter((lesson) => lesson.isAvailable)
      .sort((a, b) => Number(a.rank) - Number(b.rank));
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/db/__tests__/course-shaping.test.ts
import { describe, expect, it } from 'vitest';
import { shapeModuleLessons } from '#/db/course';

const lesson = (id: number, rank: string, isAvailable = true) => ({
  id,
  rank,
  isAvailable,
  dependsOn: [] as { lessonSlug: string; moduleSlug: string }[],
});

describe('shapeModuleLessons', () => {
  it('drops unavailable lessons', () => {
    const mod = { lessons: [lesson(1, '1'), lesson(2, '2', false), lesson(3, '3')] };
    shapeModuleLessons([mod]);
    expect(mod.lessons.map((l) => l.id)).toEqual([1, 3]);
  });

  it('sorts the remaining lessons by numeric rank', () => {
    const mod = { lessons: [lesson(1, '30'), lesson(2, '4'), lesson(3, '100')] };
    shapeModuleLessons([mod]);
    // String comparison would give 100, 30, 4 — rank is numeric(30,15).
    expect(mod.lessons.map((l) => l.id)).toEqual([2, 1, 3]);
  });

  it('adds no dependencies of its own', () => {
    const mod = { lessons: [lesson(1, '1'), lesson(2, '2'), lesson(3, '3')] };
    shapeModuleLessons([mod]);
    // The deleted block chained every lesson to its predecessor for module ids
    // 2..5, which after the ITPS import meant 36 lessons became sequential by
    // accident of primary key.
    expect(mod.lessons.every((l) => l.dependsOn.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/__tests__/course-shaping.test.ts`
Expected: FAIL — `shapeModuleLessons` is not exported yet if Step 1 was skipped; otherwise all three pass only after Step 4 removes the old block. Run it now to confirm the baseline.

- [ ] **Step 4: Replace the old block**

In `src/db/course.ts`, delete this entire block:

```ts
  // sort each module.lessons by rank
  moduleMapWithDependencies.forEach((mod) => {
    const modLessons = mod.lessons
      .filter((lesson) => lesson.isAvailable)
      .sort((a, b) => Number(a.rank) - Number(b.rank));
    // add depends on for module ids 2 to 5
    if (mod.id > 1 && mod.id < 6) {
      modLessons.forEach((lesson, index) => {
        const isFree = lesson.requiredSubscriptions.includes("associate");
        if (index > 0 && !isFree && lesson.dependsOn.length === 0) {
          lesson.dependsOn.push({
            moduleSlug: mod.slug,
            lessonSlug: modLessons[index - 1].slug,
          });
        }
      });
    }
  });
```

and replace it with:

```ts
  // Drop WIP lessons and order by rank. Gating is enforced against the real
  // lesson_dependencies rows only — the synthetic "chain every lesson in
  // module ids 2..5" block that used to live here was demo scaffolding.
  shapeModuleLessons(moduleMapWithDependencies.values());
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/__tests__/course-shaping.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 6: Verify no other consumer relied on the synthetic deps**

Run: `grep -rn "dependsOn" --include="*.ts" --include="*.tsx" src | grep -v __tests__`
Expected: only `src/db/course.ts`, `src/db/schema.ts`, and `src/lib/lesson-gating.ts`. If anything else appears, stop and report it.

- [ ] **Step 7: Verify the admin editor still lists WIP lessons**

Run: `grep -rn "getCourseDetails" --include="*.ts" --include="*.tsx" src | grep -v "db/course.ts"`
Expected: exactly one hit, `src/routes/api/course/details.ts`. More than one hit means an admin surface shares the learner payload and this filter would hide WIP lessons from the editor — stop and report it.

Then open the admin editor for `itps-uas-remote` and confirm all 104 lessons are listed, including the 23 with `is_available = false`, and that toggling availability still works.

- [ ] **Step 7: Commit**

```bash
git add src/db/course.ts src/db/__tests__/course-shaping.test.ts
git commit -m "fix(course): drop WIP lessons, sort by rank, remove demo deps

The filter and sort were computed into a local array and never assigned
back, so 23 is_available=false lessons reached students in join order.
The hard-coded module-id 2..5 dependency chain was demo scaffolding and
after the ITPS import would have made 36 lessons sequential by accident.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DB lookups for course, subscription, and video→lesson

**Files:**
- Create: `src/db/lesson-access.ts`
- Test: none (thin Drizzle wrappers; covered through Task 4's mocked tests)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `getCourseSlugForLesson(lessonSlug: string): Promise<{ courseSlug: string; courseId: number } | null>`
  - `isSubscribedToCourse(userId: string, courseId: number): Promise<boolean>`
  - `getLessonByVideoId(videoId: string): Promise<{ lessonSlug: string; courseSlug: string; courseId: number } | null>`

- [ ] **Step 1: Write the implementation**

```ts
// src/db/lesson-access.ts
import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseSubscriptionsTable,
  coursesTable,
  lessonsTable,
  modulesTable,
} from '#/db/schema';

/** The course a lesson belongs to, or null when the lesson doesn't exist. */
export async function getCourseSlugForLesson(
  lessonSlug: string,
): Promise<{ courseSlug: string; courseId: number } | null> {
  const rows = await db
    .select({ courseSlug: coursesTable.slug, courseId: coursesTable.id })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.slug, lessonSlug))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether the user holds a subscription row for the course. */
export async function isSubscribedToCourse(
  userId: string,
  courseId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: courseSubscriptionsTable.id })
    .from(courseSubscriptionsTable)
    .where(
      and(
        eq(courseSubscriptionsTable.userId, userId),
        eq(courseSubscriptionsTable.courseId, courseId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * The lesson a Synthesia video belongs to, so /api/lesson/video can apply the
 * same gates as the material route.
 *
 * KNOWN LIMITATION: matches `lessons.video_id` only. A lesson's
 * `other_video_ids` are not resolved, so a request for one of those IDs finds
 * no lesson. Callers must treat "no lesson" as denied, not as open, or this
 * becomes the bypass it was written to close.
 */
export async function getLessonByVideoId(
  videoId: string,
): Promise<{ lessonSlug: string; courseSlug: string; courseId: number } | null> {
  const rows = await db
    .select({
      lessonSlug: lessonsTable.slug,
      courseSlug: coursesTable.slug,
      courseId: coursesTable.id,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.videoId, videoId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/db/lesson-access.ts`

- [ ] **Step 3: Commit**

```bash
git add src/db/lesson-access.ts
git commit -m "feat(db): add lesson→course, subscription, and video→lesson lookups

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server-side gate assembly

**Files:**
- Create: `src/lib/lesson-gating.server.ts`
- Test: `src/lib/__tests__/lesson-gating-server.test.ts`

**Interfaces:**
- Consumes: Task 1's `GateCourse`/`evaluateLessonLock`/`evaluateMaterialLock`; Task 3's `getCourseSlugForLesson`/`isSubscribedToCourse`
- Produces:
  - `type LessonGateResult = { courseSlug: string; courseId: number; isAdmin: boolean; subscribed: boolean; lessonLock: LessonLock; materialLock: MaterialLock }`
  - `evaluateLessonGate(args: { userId: string; lessonSlug: string }): Promise<LessonGateResult | null>`
  - `toGateCourse(details: CourseDetails): GateCourse`
  - `watchedLessonSlugs(details: CourseDetails, progress: CourseProgress): Set<string>`

Implements decisions 8, 15, 20. Per-user data is combined here, never written back into the Redis-cached course payload.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/lesson-gating-server.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCourseDetailsWithCache,
  getCourseProgress,
  getCourseSlugForLesson,
  isSubscribedToCourse,
  getUserRoleNames,
} = vi.hoisted(() => ({
  getCourseDetailsWithCache: vi.fn(),
  getCourseProgress: vi.fn(),
  getCourseSlugForLesson: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getUserRoleNames: vi.fn(),
}));

vi.mock('#/db/course', () => ({ getCourseDetailsWithCache }));
vi.mock('#/db/course-progress', () => ({ getCourseProgress }));
vi.mock('#/db/lesson-access', () => ({
  getCourseSlugForLesson,
  isSubscribedToCourse,
}));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));

import { evaluateLessonGate } from '#/lib/lesson-gating.server';

const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      lessons: [
        {
          id: 10,
          slug: 'a',
          name: 'A',
          isAvailable: true,
          videoId: 'vid-a',
          needsVideoWatch: true,
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          videoId: 'vid-b',
          needsVideoWatch: true,
          dependsOn: [{ lessonSlug: 'a', moduleSlug: 'm1' }],
        },
      ],
    },
  ],
};

const progress = (watchedLessonIds: number[]) => ({
  lessons: [
    { lessonId: 10, moduleId: 1, videoId: 'vid-a', percent: 0, watched: watchedLessonIds.includes(10) },
    { lessonId: 11, moduleId: 1, videoId: 'vid-b', percent: 0, watched: watchedLessonIds.includes(11) },
  ],
});

describe('evaluateLessonGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseSlugForLesson.mockResolvedValue({ courseSlug: 'c1', courseId: 7 });
    getCourseDetailsWithCache.mockResolvedValue(details);
    getCourseProgress.mockResolvedValue(progress([]));
    isSubscribedToCourse.mockResolvedValue(true);
    getUserRoleNames.mockResolvedValue([]);
  });

  it('returns null for a lesson that does not exist', async () => {
    getCourseSlugForLesson.mockResolvedValue(null);
    expect(await evaluateLessonGate({ userId: 'u1', lessonSlug: 'nope' })).toBeNull();
  });

  it('locks a lesson whose prerequisite is unwatched', async () => {
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
    });
  });

  it('opens the lesson but locks material once the prerequisite is watched', async () => {
    getCourseProgress.mockResolvedValue(progress([10]));
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'video-locked' });
  });

  it('opens everything once the lesson video is watched too', async () => {
    getCourseProgress.mockResolvedValue(progress([10, 11]));
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'open' });
  });

  it('forces both locks open for an admin', async () => {
    getUserRoleNames.mockResolvedValue(['admin']);
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.isAdmin).toBe(true);
    expect(result?.lessonLock).toEqual({ kind: 'open' });
    expect(result?.materialLock).toEqual({ kind: 'open' });
  });

  it('reports subscription separately from the gates', async () => {
    isSubscribedToCourse.mockResolvedValue(false);
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.subscribed).toBe(false);
  });

  it('maps watched progress by lesson id, not by video id', async () => {
    // progress-summary keys by lessonId; the predicate keys by lesson slug.
    // Getting this mapping wrong silently unlocks or locks the wrong lesson.
    getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 10, moduleId: 1, videoId: 'vid-a', percent: 100, watched: true }],
    });
    const result = await evaluateLessonGate({ userId: 'u1', lessonSlug: 'b' });
    expect(result?.lessonLock).toEqual({ kind: 'open' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/lesson-gating-server.test.ts`
Expected: FAIL — `Failed to resolve import "#/lib/lesson-gating.server"`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/lesson-gating.server.ts
import { getUserRoleNames } from '#/db/admin';
import { getCourseDetailsWithCache } from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import {
  getCourseSlugForLesson,
  isSubscribedToCourse,
} from '#/db/lesson-access';
import { ADMIN_ROLE } from '#/lib/admin-schemas';
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type GateCourse,
  type LessonLock,
  type MaterialLock,
} from '#/lib/lesson-gating';

export type LessonGateResult = {
  courseSlug: string;
  courseId: number;
  isAdmin: boolean;
  subscribed: boolean;
  lessonLock: LessonLock;
  materialLock: MaterialLock;
};

type DetailsLesson = {
  id: number;
  slug: string;
  name: string;
  isAvailable: boolean;
  videoId: string | null;
  needsVideoWatch: boolean;
  dependsOn: readonly { lessonSlug: string; moduleSlug?: string }[];
};
type DetailsModule = {
  id: number;
  slug: string;
  name: string;
  dependsOn: readonly string[];
  lessons: readonly DetailsLesson[];
};
type DetailsCourse = { modules: readonly DetailsModule[] };

/** Narrow the cached course payload to the fields the predicate needs. */
export function toGateCourse(details: DetailsCourse): GateCourse {
  return {
    modules: details.modules.map((m) => ({
      slug: m.slug,
      name: m.name,
      dependsOn: m.dependsOn,
      lessons: m.lessons.map((l) => ({
        slug: l.slug,
        name: l.name,
        isAvailable: l.isAvailable,
        videoId: l.videoId,
        needsVideoWatch: l.needsVideoWatch,
        dependsOn: l.dependsOn,
      })),
    })),
  };
}

/**
 * The lesson slugs whose video this user has watched.
 *
 * getCourseProgress keys by lessonId while the predicate keys by slug, so the
 * course payload supplies the id→slug mapping. Keying by videoId instead would
 * be wrong the moment two lessons share a video.
 */
export function watchedLessonSlugs(
  details: DetailsCourse,
  progress: { lessons: readonly { lessonId: number; watched: boolean }[] },
): Set<string> {
  const slugById = new Map<number, string>();
  for (const module of details.modules) {
    for (const lesson of module.lessons) slugById.set(lesson.id, lesson.slug);
  }
  const watched = new Set<string>();
  for (const row of progress.lessons) {
    if (!row.watched) continue;
    const slug = slugById.get(row.lessonId);
    if (slug) watched.add(slug);
  }
  return watched;
}

/**
 * Evaluate every gate for one user and one lesson. Returns null when the
 * lesson does not exist, so callers can 404 without a second lookup.
 *
 * Admins bypass both gates AND the subscription check: they author this
 * content and should not sit through their own videos to proofread it. The
 * `isAdmin` flag is returned rather than swallowed so the UI can say the
 * bypass applied — a silent bypass makes the feature untestable.
 */
export async function evaluateLessonGate({
  userId,
  lessonSlug,
}: {
  userId: string;
  lessonSlug: string;
}): Promise<LessonGateResult | null> {
  const course = await getCourseSlugForLesson(lessonSlug);
  if (!course) return null;

  const [roles, details, progress] = await Promise.all([
    getUserRoleNames(userId),
    getCourseDetailsWithCache(course.courseSlug),
    getCourseProgress({ userId, slug: course.courseSlug }),
  ]);

  const isAdmin = roles.includes(ADMIN_ROLE);
  if (isAdmin) {
    return {
      ...course,
      isAdmin: true,
      subscribed: true,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  const subscribed = await isSubscribedToCourse(userId, course.courseId);
  if (!details) {
    return {
      ...course,
      isAdmin: false,
      subscribed,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    };
  }

  const gateCourse = toGateCourse(details as unknown as DetailsCourse);
  const watched = watchedLessonSlugs(
    details as unknown as DetailsCourse,
    progress,
  );

  return {
    ...course,
    isAdmin: false,
    subscribed,
    lessonLock: evaluateLessonLock(gateCourse, lessonSlug, watched),
    materialLock: evaluateMaterialLock(gateCourse, lessonSlug, watched),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/lesson-gating-server.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/lesson-gating.server.ts src/lib/__tests__/lesson-gating-server.test.ts
git commit -m "feat(gating): assemble gate inputs server-side

Combines the Redis-cached course payload with per-user progress without
writing per-user data back into that cache. Admins bypass both gates and
the subscription check, and the bypass is reported, not swallowed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Gate the material route

**Files:**
- Modify: `src/routes/api/lesson/material.ts`
- Test: `src/routes/api/lesson/__tests__/material.test.ts` (create)

**Interfaces:**
- Consumes: Task 4's `evaluateLessonGate`; Task 1's `lockedResponse`, `LessonMaterialResponse`
- Produces: `getLessonMaterialHandler(request: Request): Promise<Response>` returning `LessonMaterialResponse<LessonMaterialSelect>`

Implements decisions 6, 7, 8, 15, plus the assumed defaults (gate before existence check; 500 on gate failure, never a false lock).

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/api/lesson/__tests__/material.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, evaluateLessonGate, getLessonMaterial } = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getLessonMaterial: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
vi.mock('#/db/lesson', () => ({ getLessonMaterial }));

import { getLessonMaterialHandler } from '../material';

const req = (query = '?lessonSlug=b') =>
  new Request(`http://test/api/lesson/material${query}`);

const material = { lessonSlug: 'b', text: 'body', keyPoints: ['k'], quiz: [] };

const openGate = {
  courseSlug: 'c1',
  courseId: 7,
  isAdmin: false,
  subscribed: true,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'open' },
};

describe('getLessonMaterialHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    evaluateLessonGate.mockResolvedValue(openGate);
    getLessonMaterial.mockResolvedValue(material);
  });

  it('401s an anonymous caller without touching the database', async () => {
    getSession.mockResolvedValue(null);
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(401);
    expect(getLessonMaterial).not.toHaveBeenCalled();
    expect(evaluateLessonGate).not.toHaveBeenCalled();
  });

  it('403s a signed-in caller with no subscription', async () => {
    evaluateLessonGate.mockResolvedValue({ ...openGate, subscribed: false });
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(403);
    expect(getLessonMaterial).not.toHaveBeenCalled();
  });

  it('returns the material, including text, when unlocked', async () => {
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locked).toBe(false);
    // lesson-player-container feeds material.text into debrief generation, so
    // dropping it (as the old platform's endpoint did) breaks the debrief.
    expect(body.material.text).toBe('body');
    expect(body.adminBypass).toBe(false);
  });

  it('reports the video gate without any material content', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      materialLock: { kind: 'video-locked' },
    });
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ locked: true, reason: 'video' });
    // Content must be structurally absent, not nulled — a nulled flat shape
    // leaks every column added to lesson_material later.
    expect(getLessonMaterial).not.toHaveBeenCalled();
  });

  it('names the blocking lesson when the lesson gate fails', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      lessonLock: {
        kind: 'lesson-locked',
        lessonSlug: 'a',
        moduleSlug: 'm1',
        lessonName: 'A',
      },
    });
    const body = await (await getLessonMaterialHandler(req())).json();
    expect(body).toEqual({
      locked: true,
      reason: 'lesson',
      blockedBy: { lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
    });
  });

  it('names the blocking module when the module gate fails', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      lessonLock: { kind: 'module-locked', moduleSlug: 'm1', moduleName: 'M' },
    });
    const body = await (await getLessonMaterialHandler(req())).json();
    expect(body.reason).toBe('module');
    expect(body.blockedBy).toEqual({ moduleSlug: 'm1', moduleName: 'M' });
  });

  it('flags an admin bypass rather than hiding it', async () => {
    evaluateLessonGate.mockResolvedValue({ ...openGate, isAdmin: true });
    const body = await (await getLessonMaterialHandler(req())).json();
    expect(body.adminBypass).toBe(true);
  });

  it('404s an unknown lesson', async () => {
    evaluateLessonGate.mockResolvedValue(null);
    expect((await getLessonMaterialHandler(req())).status).toBe(404);
  });

  it('does not reveal whether material exists for a locked lesson', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      materialLock: { kind: 'video-locked' },
    });
    getLessonMaterial.mockResolvedValue(null);
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    expect((await res.json()).reason).toBe('video');
  });

  it('500s when the gate throws instead of showing a false lock', async () => {
    evaluateLessonGate.mockRejectedValue(new Error('db down'));
    const res = await getLessonMaterialHandler(req());
    // A gate failure must not read as "locked" — the student would be told to
    // watch a video they already watched, with no way to recover.
    expect(res.status).toBe(500);
  });

  it('400s when lessonSlug is missing, after the auth check', async () => {
    getSession.mockResolvedValue(null);
    expect((await getLessonMaterialHandler(req(''))).status).toBe(401);
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    expect((await getLessonMaterialHandler(req(''))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/api/lesson/__tests__/material.test.ts`
Expected: FAIL — `getLessonMaterialHandler` is not exported

- [ ] **Step 3: Write the implementation**

Replace the whole of `src/routes/api/lesson/material.ts` with:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getLessonMaterial } from '#/db/lesson';
import { auth } from '#/lib/auth';
import { lockedResponse } from '#/lib/lesson-gating';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * A lesson's material for the learner, gated.
 *
 * Before this gate existed the route had no auth at all — any unauthenticated
 * request returned the full material for any slug. It now requires a session,
 * a subscription to the lesson's course, and satisfaction of the module,
 * lesson, and video gates.
 *
 * The gate is evaluated BEFORE the material row is read, so a locked lesson
 * never reveals whether material exists, and a locked response never touches
 * the content at all.
 */
export async function getLessonMaterialHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const lessonSlug = new URL(request.url).searchParams.get('lessonSlug');
  if (!lessonSlug) {
    return new Response('lessonSlug is required', { status: 400 });
  }

  try {
    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug,
    });
    if (!gate) {
      return Response.json({ error: 'Lesson not found' }, { status: 404 });
    }
    if (!gate.subscribed) {
      return new Response('Forbidden', { status: 403 });
    }

    const locked = lockedResponse(gate.lessonLock, gate.materialLock);
    if (locked) return Response.json(locked);

    const material = await getLessonMaterial(lessonSlug);
    if (!material) {
      return Response.json(
        { error: 'Lesson material not found' },
        { status: 404 },
      );
    }
    return Response.json({
      locked: false,
      adminBypass: gate.isAdmin,
      material,
    });
  } catch (error) {
    // Deliberately a 500, never a lock: a gate that fails closed would tell a
    // student to rewatch a video they already finished, with no way out.
    console.error('Failed to evaluate lesson material gate:', error);
    return Response.json({ error: 'Failed to load material' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/lesson/material')({
  server: {
    handlers: {
      GET: ({ request }) => getLessonMaterialHandler(request),
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/api/lesson/__tests__/material.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lesson/material.ts src/routes/api/lesson/__tests__/material.test.ts
git commit -m "feat(gating): require auth, subscription, and gates for material

The route previously had no authentication whatsoever. Locked responses
carry a reason and no content; the gate runs before the material row is
read so a lock never reveals whether material exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Gate the video route

**Files:**
- Modify: `src/routes/api/lesson/video.ts`
- Modify: `src/routes/api/lesson/__tests__/video.test.ts`

**Interfaces:**
- Consumes: Task 3's `getLessonByVideoId`, Task 4's `evaluateLessonGate`
- Produces: `getLessonVideoHandler` denies with `403` unless the lesson is open

Implements decision 16 and closes the authorization gap documented at `video.ts:14-19`.

- [ ] **Step 1: Add the failing tests**

Append to `src/routes/api/lesson/__tests__/video.test.ts`, and add these mocks alongside the existing `vi.hoisted` block:

```ts
const { getLessonByVideoId, evaluateLessonGate } = vi.hoisted(() => ({
  getLessonByVideoId: vi.fn(),
  evaluateLessonGate: vi.fn(),
}));
vi.mock('#/db/lesson-access', () => ({ getLessonByVideoId }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
```

Add to `beforeEach`:

```ts
    getLessonByVideoId.mockResolvedValue({
      lessonSlug: 'b',
      courseSlug: 'c1',
      courseId: 7,
    });
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: false,
      subscribed: true,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    });
```

New tests:

```ts
  it('403s when the lesson is locked by its prerequisites', async () => {
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: false,
      subscribed: true,
      lessonLock: { kind: 'lesson-locked', lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
      materialLock: { kind: 'open' },
    });

    const res = await getLessonVideoHandler(req());

    expect(res.status).toBe(403);
    // The body embeds a pre-signed download URL — a locked lesson must not
    // reach the provider at all.
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('403s when the caller is not subscribed', async () => {
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: false,
      subscribed: false,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    });

    expect((await getLessonVideoHandler(req())).status).toBe(403);
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('403s a videoId that belongs to no lesson', async () => {
    getLessonByVideoId.mockResolvedValue(null);

    const res = await getLessonVideoHandler(req());

    // Fail closed: an unresolvable videoId is exactly the enumeration hole
    // this gate exists to close, so it must not fall through to the provider.
    expect(res.status).toBe(403);
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('serves the video when the lesson is open', async () => {
    getVideoDetailsWithCache.mockResolvedValue(details);
    const res = await getLessonVideoHandler(req());
    expect(res.status).toBe(200);
  });

  it('serves the video for an admin regardless of gates', async () => {
    evaluateLessonGate.mockResolvedValue({
      courseSlug: 'c1',
      courseId: 7,
      isAdmin: true,
      subscribed: true,
      lessonLock: { kind: 'open' },
      materialLock: { kind: 'open' },
    });
    getVideoDetailsWithCache.mockResolvedValue(details);
    expect((await getLessonVideoHandler(req())).status).toBe(200);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/routes/api/lesson/__tests__/video.test.ts`
Expected: the 5 new tests FAIL (the route still serves any videoId); the 5 original tests PASS

- [ ] **Step 3: Write the implementation**

In `src/routes/api/lesson/video.ts`, replace the doc comment's "KNOWN GAP" paragraph and insert the gate between the `videoId` check and the provider call:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getLessonByVideoId } from '#/db/lesson-access';
import { getVideoDetailsWithCache } from '#/integrations/synthesia/videos';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * Synthesia video details for the learner player.
 *
 * The session check is not optional: the response embeds Synthesia's
 * pre-signed `download` URL, so before this gate existed anyone on the
 * internet who reached this route could stream video straight out of the
 * account.
 *
 * Authorization now resolves videoId → lesson → course and applies the same
 * module and lesson gates as the material route, closing the enumeration gap
 * this route used to document. A videoId that resolves to no lesson is DENIED,
 * not allowed through — `getLessonByVideoId` matches `lessons.video_id` only,
 * so a lesson's `other_video_ids` are not currently playable by this route.
 * Failures below stay deliberately uniform so the route never confirms which
 * IDs are real.
 */
export async function getLessonVideoHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  if (!videoId) {
    return new Response('videoId is required', { status: 400 });
  }

  try {
    const lesson = await getLessonByVideoId(videoId);
    // One status for "no such lesson", "not subscribed", and "locked" alike:
    // distinguishing them hands an enumeration oracle to any signed-in caller.
    if (!lesson) return new Response('Forbidden', { status: 403 });

    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug: lesson.lessonSlug,
    });
    if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
      return new Response('Forbidden', { status: 403 });
    }
  } catch (error) {
    console.error('Failed to authorize lesson video:', error);
    return new Response('Video lookup failed', { status: 502 });
  }

  try {
    const details = await getVideoDetailsWithCache(videoId);
    return Response.json(details);
  } catch {
    return new Response('Video lookup failed', { status: 502 });
  }
}

export const Route = createFileRoute('/api/lesson/video')({
  server: {
    handlers: {
      GET: ({ request }) => getLessonVideoHandler(request),
    },
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/api/lesson/__tests__/video.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/lesson/video.ts src/routes/api/lesson/__tests__/video.test.ts
git commit -m "feat(gating): authorize the lesson video route

Resolves videoId to its lesson and applies the module and lesson gates,
closing the enumeration gap the route previously documented. An
unresolvable videoId is denied rather than served.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `crossedMilestones` — the anti-skip primitive

**Files:**
- Modify: `src/lib/course-milestones.ts`
- Modify: `src/lib/__tests__/course-milestones.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `crossedMilestones(prevPercent: number, currentPercent: number, reported: ReadonlySet<number>): number[]`, `SEEK_THRESHOLD_SECONDS: number`

Implements decisions 9 and 10. `unreportedMilestones` stays exported for now and is removed in Task 8 once its last caller is gone.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/course-milestones.test.ts`:

```ts
import { crossedMilestones } from '#/lib/course-milestones';

describe('crossedMilestones', () => {
  it('reports only milestones crossed by this advance', () => {
    expect(crossedMilestones(8, 12, new Set())).toEqual([10]);
  });

  it('reports nothing when no milestone lies in the interval', () => {
    expect(crossedMilestones(11, 12, new Set())).toEqual([]);
  });

  it('does NOT report every milestone below the current position', () => {
    // This is the whole point. The old unreportedMilestones(95, new Set())
    // returned all 19 milestones, so one scrubber drag or a press of End
    // recorded a full watch and unlocked the material instantly.
    expect(crossedMilestones(94, 95, new Set())).toEqual([95]);
  });

  it('skips milestones already reported', () => {
    expect(crossedMilestones(8, 22, new Set([10, 15]))).toEqual([20]);
  });

  it('reports a contiguous run when a tick spans several milestones', () => {
    expect(crossedMilestones(8, 22, new Set())).toEqual([10, 15, 20]);
  });

  it('returns nothing for a backwards interval', () => {
    expect(crossedMilestones(50, 20, new Set())).toEqual([]);
  });

  it('returns nothing for non-finite input', () => {
    expect(crossedMilestones(Number.NaN, 50, new Set())).toEqual([]);
    expect(crossedMilestones(0, Number.POSITIVE_INFINITY, new Set())).toEqual([]);
  });

  it('supports out-of-order coverage across sessions', () => {
    // Watching the last three minutes, then the first three, must add up.
    const reported = new Set<number>();
    for (const m of crossedMilestones(84, 100, reported)) reported.add(m);
    for (const m of crossedMilestones(0, 83, reported)) reported.add(m);
    expect(isVideoWatched(reported)).toBe(true);
  });
});
```

Ensure `isVideoWatched` is imported in that test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/course-milestones.test.ts`
Expected: FAIL — `crossedMilestones is not a function`

- [ ] **Step 3: Write the implementation**

Append to `src/lib/course-milestones.ts`:

```ts
/**
 * Largest single playback advance, in seconds, still treated as watching.
 * `timeupdate` fires roughly four times a second, so anything beyond this is a
 * seek — even at 2× playback a normal tick stays well under it.
 */
export const SEEK_THRESHOLD_SECONDS = 2;

/**
 * Milestones the playhead crossed moving from `prevPercent` to
 * `currentPercent`, excluding any already in `reported`.
 *
 * Contrast with `unreportedMilestones`, which returns every milestone at or
 * below the current position: from a fresh set that reported all 19 the
 * instant the playhead reached the end, so pressing End or dragging the
 * scrubber recorded a complete watch. Only what playback actually crossed
 * counts here — that is the anti-skip guarantee.
 *
 * Order is irrelevant: coverage is what unlocks, so watching the end first and
 * the start later accumulates correctly across sessions.
 */
export function crossedMilestones(
  prevPercent: number,
  currentPercent: number,
  reported: ReadonlySet<number>,
): number[] {
  if (!Number.isFinite(prevPercent) || !Number.isFinite(currentPercent)) {
    return [];
  }
  return milestones.filter(
    (m) => m > prevPercent && m <= currentPercent && !reported.has(m),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/course-milestones.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/course-milestones.ts src/lib/__tests__/course-milestones.test.ts
git commit -m "feat(progress): add crossedMilestones for anti-skip reporting

unreportedMilestones returns every milestone at or below the playhead, so
seeking to the end reported all 19 at once. crossedMilestones reports only
what playback actually crossed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Rewrite the milestone reporter — crossing, seed, reconcile

**Files:**
- Modify: `src/components/video-player/use-milestone-reporter.ts`
- Modify: `src/components/lesson-main/parts/lesson-player-container.tsx` (pass `lessonSlug`)
- Create: `src/components/video-player/reconcile-coverage.ts`
- Test: `src/components/video-player/__tests__/reconcile-coverage.test.ts`

**Interfaces:**
- Consumes: Task 7's `crossedMilestones`, `SEEK_THRESHOLD_SECONDS`; existing `useVideoProgress` (`src/data-hooks/use-video-progress.ts`), `isVideoWatched`
- Produces:
  - `useMilestoneReporter(playerId: string, videoId: string, lessonSlug: string): void`
  - `reconcileCoverage(args: { videoId: string; reported: ReadonlySet<number>; report: (input: { videoId: string; progress: number }) => void; fetchProgress: (videoId: string) => Promise<{ milestonesHit: number[]; watched: boolean }> }): Promise<number[]>` — returns the milestones it re-reported

Implements decisions 9, 11.

- [ ] **Step 1: Write the failing test for the reconcile step**

```ts
// src/components/video-player/__tests__/reconcile-coverage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { reconcileCoverage } from '../reconcile-coverage';

describe('reconcileCoverage', () => {
  it('re-reports milestones the server is missing', async () => {
    const report = vi.fn();
    const fetchProgress = vi.fn().mockResolvedValue({
      milestonesHit: [10, 15],
      watched: false,
    });

    const resent = await reconcileCoverage({
      videoId: 'v1',
      reported: new Set([10, 15, 20]),
      report,
      fetchProgress,
    });

    // Reports go by sendBeacon and are fire-and-forget; a dropped one would
    // otherwise strand the student behind a lock they legitimately cleared.
    expect(resent).toEqual([20]);
    expect(report).toHaveBeenCalledWith({ videoId: 'v1', progress: 20 });
  });

  it('sends nothing when the server already agrees', async () => {
    const report = vi.fn();
    const fetchProgress = vi.fn().mockResolvedValue({
      milestonesHit: [10, 15, 20],
      watched: true,
    });

    const resent = await reconcileCoverage({
      videoId: 'v1',
      reported: new Set([10, 15, 20]),
      report,
      fetchProgress,
    });

    expect(resent).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it('never throws when the progress fetch fails', async () => {
    const report = vi.fn();
    const fetchProgress = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      reconcileCoverage({
        videoId: 'v1',
        reported: new Set([10]),
        report,
        fetchProgress,
      }),
    ).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/video-player/__tests__/reconcile-coverage.test.ts`
Expected: FAIL — cannot resolve `../reconcile-coverage`

- [ ] **Step 3: Write `reconcile-coverage.ts`**

```ts
// src/components/video-player/reconcile-coverage.ts
export type ProgressSnapshot = { milestonesHit: number[]; watched: boolean };

/**
 * Called once, the moment the client believes it has covered every milestone.
 *
 * Milestone reports go out via `sendBeacon`, which discards the response, so
 * the client cannot tell a delivered report from a dropped one. Without this
 * step a single dropped beacon leaves the student behind a lock they
 * legitimately cleared, with no way to retry short of rewatching the video.
 *
 * Best-effort by design: a failed lookup resolves to "nothing re-sent" rather
 * than throwing, because the caller invalidates the material query either way
 * and a locked response is cached with staleTime 0.
 */
export async function reconcileCoverage({
  videoId,
  reported,
  report,
  fetchProgress,
}: {
  videoId: string;
  reported: ReadonlySet<number>;
  report: (input: { videoId: string; progress: number }) => void;
  fetchProgress: (videoId: string) => Promise<ProgressSnapshot>;
}): Promise<number[]> {
  let snapshot: ProgressSnapshot;
  try {
    snapshot = await fetchProgress(videoId);
  } catch {
    return [];
  }
  if (snapshot.watched) return [];

  const onServer = new Set(snapshot.milestonesHit);
  const missing = [...reported].filter((m) => !onServer.has(m)).sort((a, b) => a - b);
  for (const progress of missing) report({ videoId, progress });
  return missing;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/video-player/__tests__/reconcile-coverage.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Rewrite the reporter hook**

Replace `src/components/video-player/use-milestone-reporter.ts` with:

```ts
import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { dataKeys } from '#/data-hooks/keys';
import { useReportVideoProgress } from '#/data-hooks/use-report-video-progress';
import { useVideoProgress } from '#/data-hooks/use-video-progress';
import { queryKeys } from '#/hooks/data/keys';
import {
  crossedMilestones,
  isVideoWatched,
  SEEK_THRESHOLD_SECONDS,
} from '#/lib/course-milestones';
import { videoPlayerStateAtomFamily } from './atoms';
import { reconcileCoverage } from './reconcile-coverage';

async function fetchProgress(videoId: string) {
  const res = await fetch(
    `/api/user/video-progress?videoId=${encodeURIComponent(videoId)}`,
  );
  if (!res.ok) throw new Error(`Failed to load video progress (${res.status})`);
  return (await res.json()) as { milestonesHit: number[]; watched: boolean };
}

/**
 * Reports video-progress milestones as playback advances, and unlocks the
 * lesson material the moment coverage completes.
 *
 * Three properties, each load-bearing:
 *
 * 1. ANTI-SKIP — only milestones the playhead *crosses* during a
 *    playback-sized advance are reported. A jump in either direction is a
 *    seek: the cursor moves, nothing is reported.
 * 2. SEEDED — the reported set starts from the server's existing milestones,
 *    so coverage earned in earlier sessions counts and is never re-reported.
 *    Nothing is reported until that seed lands, or the first ticks would
 *    duplicate everything already earned.
 * 3. NO POLLING — because the client is the only writer, the seeded set
 *    mirrors the server exactly, so completion is detected locally on the tick
 *    that finishes it, out-of-order watching included.
 */
export function useMilestoneReporter(
  playerId: string,
  videoId: string,
  lessonSlug: string,
): void {
  const { currentTime, duration } = useAtomValue(
    videoPlayerStateAtomFamily(playerId),
  );
  const report = useReportVideoProgress();
  const queryClient = useQueryClient();
  const progress = useVideoProgress(videoId);

  const reportRef = useRef(report);
  reportRef.current = report;
  const lessonSlugRef = useRef(lessonSlug);
  lessonSlugRef.current = lessonSlug;

  const reportedRef = useRef<Set<number>>(new Set());
  const seededForRef = useRef<string | null>(null);
  const lastTimeRef = useRef(0);
  const reconciledRef = useRef(false);
  const videoIdRef = useRef(videoId);

  const milestonesHit = progress.data?.milestonesHit;

  useEffect(() => {
    if (!videoId || !milestonesHit) return;
    if (seededForRef.current === videoId) return;
    reportedRef.current = new Set(milestonesHit);
    seededForRef.current = videoId;
  }, [videoId, milestonesHit]);

  useEffect(() => {
    if (videoIdRef.current !== videoId) {
      videoIdRef.current = videoId;
      reportedRef.current = new Set();
      seededForRef.current = null;
      lastTimeRef.current = 0;
      reconciledRef.current = false;
    }
    if (!videoId || !Number.isFinite(duration) || duration <= 0) return;
    if (seededForRef.current !== videoId) return;

    const prevTime = lastTimeRef.current;
    const advance = currentTime - prevTime;
    lastTimeRef.current = currentTime;
    if (advance < 0 || advance > SEEK_THRESHOLD_SECONDS) return;

    const crossed = crossedMilestones(
      (prevTime / duration) * 100,
      (currentTime / duration) * 100,
      reportedRef.current,
    );
    for (const milestone of crossed) {
      reportedRef.current.add(milestone);
      reportRef.current.mutate({ videoId, progress: milestone });
    }

    if (reconciledRef.current) return;
    if (!isVideoWatched(reportedRef.current)) return;
    reconciledRef.current = true;

    void reconcileCoverage({
      videoId,
      reported: reportedRef.current,
      report: (input) => reportRef.current.mutate(input),
      fetchProgress,
    }).then(() => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.lessonMaterial(lessonSlugRef.current),
      });
      queryClient.invalidateQueries({
        queryKey: dataKeys.videoProgress(videoId),
      });
    });
  }, [currentTime, duration, videoId, queryClient]);
}
```

- [ ] **Step 6: Pass `lessonSlug` from the caller**

In `src/components/lesson-main/parts/lesson-player-container.tsx`, change line 31:

```ts
  useMilestoneReporter(playerId, videoId, lessonSlug);
```

- [ ] **Step 7: Remove the now-dead `unreportedMilestones`**

Run: `grep -rn "unreportedMilestones" --include="*.ts" --include="*.tsx" src`
If the only remaining hits are `src/lib/course-milestones.ts` and its test, delete the function and its tests. If any other caller exists, leave it and note which.

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/video-player/use-milestone-reporter.ts \
        src/components/video-player/reconcile-coverage.ts \
        src/components/video-player/__tests__/reconcile-coverage.test.ts \
        src/components/lesson-main/parts/lesson-player-container.tsx \
        src/lib/course-milestones.ts src/lib/__tests__/course-milestones.test.ts
git commit -m "feat(progress): anti-skip reporting with seed and reconcile

Report only milestones crossed by playback; seed from the server so
earlier sessions count; reconcile once on coverage so a dropped beacon
cannot strand a student behind a lock they cleared. No polling.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Gate the AI chat's course context

**Files:**
- Modify: `src/db/course-content.ts`
- Modify: `src/ai/tools/search-kb.ts`
- Modify: `src/ai/chat.ts`
- Test: `src/db/__tests__/course-content-gating.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's predicate, Task 4's `toGateCourse`/`watchedLessonSlugs`
- Produces: `getCourseContentForAgent(slug: string, opts?: { userId?: string })` omits lessons the user cannot read; `makeSearchKBTool({ courseSlug, courseId, userId })`

Implements decisions 13 and 14. Without this the lock is theatre: the chat widget is mounted globally in `__root.tsx:79` and currently feeds every lesson's `text` and `proTips` to the model.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/__tests__/course-content-gating.test.ts
import { describe, expect, it } from 'vitest';
import { filterGatedLessons } from '#/db/course-content';

const row = (lessonSlug: string, text: string) => ({
  lessonId: 1,
  lessonSlug,
  lessonName: lessonSlug,
  moduleId: 1,
  moduleName: 'M',
  courseName: 'C',
  text,
  proTips: 'tips',
});

const course = {
  modules: [
    {
      slug: 'm1',
      name: 'M',
      dependsOn: [],
      lessons: [
        { slug: 'a', name: 'A', isAvailable: true, videoId: 'v', needsVideoWatch: true, dependsOn: [] },
        { slug: 'b', name: 'B', isAvailable: true, videoId: 'v2', needsVideoWatch: true, dependsOn: [] },
      ],
    },
  ],
};

describe('filterGatedLessons', () => {
  it('drops rows for lessons the user has not unlocked', () => {
    const kept = filterGatedLessons([row('a', 'A body'), row('b', 'B body')], course, new Set(['a']), false);
    // A student locked out of B must not be able to ask the chat for it.
    expect(kept.map((r) => r.lessonSlug)).toEqual(['a']);
  });

  it('keeps everything for an admin', () => {
    const kept = filterGatedLessons([row('a', 'A body'), row('b', 'B body')], course, new Set(), true);
    expect(kept).toHaveLength(2);
  });

  it('keeps everything when no user context is available', () => {
    const kept = filterGatedLessons([row('a', 'A body')], course, null, false);
    expect(kept).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/__tests__/course-content-gating.test.ts`
Expected: FAIL — `filterGatedLessons` is not exported

- [ ] **Step 3: Add the filter and wire it in**

Add to `src/db/course-content.ts`:

```ts
import {
  evaluateLessonLock,
  evaluateMaterialLock,
  type GateCourse,
} from '#/lib/lesson-gating';

type GatedRow = { lessonSlug: string };

/**
 * Drop rows for lessons this user cannot read.
 *
 * The chat widget is mounted app-wide and its knowledge base is assembled from
 * lesson_material, so without this a student locked out of a lesson can simply
 * ask the assistant for its key points. A null `watched` set means "no user
 * context" (an unauthenticated or system caller) and keeps everything —
 * callers that need gating must pass a set.
 */
export function filterGatedLessons<T extends GatedRow>(
  rows: T[],
  course: GateCourse,
  watchedLessonSlugs: ReadonlySet<string> | null,
  isAdmin: boolean,
): T[] {
  if (isAdmin || watchedLessonSlugs === null) return rows;
  return rows.filter((r) => {
    const lessonLock = evaluateLessonLock(course, r.lessonSlug, watchedLessonSlugs);
    if (lessonLock.kind !== 'open') return false;
    return (
      evaluateMaterialLock(course, r.lessonSlug, watchedLessonSlugs).kind === 'open'
    );
  });
}
```

Then in `getCourseContentForAgent`:
- add `lessonSlug: lessonsTable.slug` to the `select` block
- change the signature to `getCourseContentForAgent(slug: string, opts?: { userId?: string })`
- after the rows are fetched and before they are assembled, when `opts?.userId` is set, load `getCourseDetailsWithCache(slug)`, `getCourseProgress({ userId, slug })` and `getUserRoleNames(userId)`, build the gate inputs with `toGateCourse` / `watchedLessonSlugs` from `#/lib/lesson-gating.server`, and pass the rows through `filterGatedLessons`

- [ ] **Step 4: Thread `courseSlug` and `userId` through the tool**

In `src/ai/tools/search-kb.ts`, extend the options type with `userId?: string` and replace the defaulted slug:

```ts
export function makeSearchKBTool(
  opts: {
    writer?: { write: (p: unknown) => void };
    courseSlug: string;
    courseId?: number;
    userId?: string;
  },
) {
  const courseSlug = opts.courseSlug;
```

and pass the user through:

```ts
        getCourseContentForAgent(courseSlug, { userId: opts.userId }),
```

In `src/ai/chat.ts:70`, pass the real course and user instead of relying on the default:

```ts
      searchKB: makeSearchKBTool({ writer, courseSlug, courseId, userId }),
```

Thread `courseSlug`, `courseId`, and `userId` into that function from its caller. If the chat request does not currently carry a course, use the course of the lesson the user is on; if neither is available, the tool must be constructed with the user's single subscribed course rather than a hard-coded slug.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/__tests__/course-content-gating.test.ts src/ai/tools/__tests__/search-kb.test.ts`
Expected: PASS. Update `search-kb.test.ts` for the now-required `courseSlug` option.

- [ ] **Step 6: Commit**

```bash
git add src/db/course-content.ts src/db/__tests__/course-content-gating.test.ts \
        src/ai/tools/search-kb.ts src/ai/chat.ts src/ai/tools/__tests__/search-kb.test.ts
git commit -m "feat(gating): stop the AI chat leaking locked lesson material

search-kb fed every lesson's text and proTips to the model unfiltered, so
a locked student could just ask for them. Also fixes the tool defaulting
to the 3d-airmanship course for every conversation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Locked material panel

**Files:**
- Create: `src/components/lesson-material/parts/material-locked.tsx`
- Create: `src/components/lesson-material/parts/__tests__/material-locked.test.tsx`
- Modify: `src/components/lesson-material/lesson-material-wrapper.tsx`
- Modify: `src/atoms/lesson-material.ts`

**Interfaces:**
- Consumes: Task 1's `LessonMaterialResponse`, `LockedMaterialResponse`
- Produces: `MaterialLocked` presentational component; the atom now types its data as `LessonMaterialResponse<LessonMaterialRow>`

Implements decisions 6, 12, 18-adjacent copy, and the "state the reason" principle. `MaterialLocked` is presentational — no hooks (see Global Constraints).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/lesson-material/parts/__tests__/material-locked.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MaterialLocked } from '../material-locked';

describe('MaterialLocked', () => {
  it('tells the student to watch the video', () => {
    render(<MaterialLocked lock={{ locked: true, reason: 'video' }} courseSlug="c" />);
    expect(screen.getByRole('status').textContent).toContain('Watch the video');
  });

  it('names the blocking lesson and links to it', () => {
    render(
      <MaterialLocked
        lock={{
          locked: true,
          reason: 'lesson',
          blockedBy: { lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'Close Encounters' },
        }}
        courseSlug="c"
      />,
    );
    // "Finish Close Encounters first" is actionable; "prerequisite not met" is not.
    expect(screen.getByRole('status').textContent).toContain('Close Encounters');
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/course/c/modules/m1/lessons/a',
    );
  });

  it('names the blocking module', () => {
    render(
      <MaterialLocked
        lock={{ locked: true, reason: 'module', blockedBy: { moduleSlug: 'm1', moduleName: 'Wakeup Call' } }}
        courseSlug="c"
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Wakeup Call');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/lesson-material/parts/__tests__/material-locked.test.tsx`
Expected: FAIL — cannot resolve `../material-locked`

- [ ] **Step 3: Write the component**

```tsx
// src/components/lesson-material/parts/material-locked.tsx
import { Lock } from 'lucide-react';
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

type MaterialLockedProps = {
  lock: LockedMaterialResponse;
  courseSlug: string;
};

/**
 * Why this lesson's material is locked, and what clears it.
 *
 * Presentational and hookless by design (react-compiler + vitest null the
 * dispatcher, so a hook here would make this untestable). Every branch states
 * a reason — a lock icon with no explanation is the failure mode this exists
 * to prevent.
 */
export const MaterialLocked = ({ lock, courseSlug }: MaterialLockedProps) => {
  const body =
    lock.reason === 'video' ? (
      <p className="text-sm text-secondary">
        Watch the video to unlock the key points, quiz, and the rest of this
        lesson&rsquo;s material.
      </p>
    ) : lock.reason === 'lesson' ? (
      <p className="text-sm text-secondary">
        Finish{' '}
        <a
          className="text-primary underline underline-offset-2"
          href={`/course/${courseSlug}/modules/${lock.blockedBy.moduleSlug}/lessons/${lock.blockedBy.lessonSlug}`}
        >
          {lock.blockedBy.lessonName}
        </a>{' '}
        first to unlock this lesson&rsquo;s material.
      </p>
    ) : (
      <p className="text-sm text-secondary">
        Finish the {lock.blockedBy.moduleName} module first to unlock this
        lesson&rsquo;s material.
      </p>
    );

  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <p className="text-base font-medium text-primary">Material locked</p>
      {body}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/lesson-material/parts/__tests__/material-locked.test.tsx`
Expected: PASS — 3 tests

- [ ] **Step 5: Update the atom's type and staleness**

In `src/atoms/lesson-material.ts`, change the query type to `LessonMaterialResponse<NonNullable<LessonMaterial>>` and make staleness depend on the answer:

```ts
    staleTime: (query) =>
      // A stale LOCKED response is harmful — the student clears the gate and
      // the tabs stay shut for the rest of the hour. A stale UNLOCKED response
      // cannot go stale in a harmful direction.
      query.state.data && query.state.data.locked ? 0 : 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
```

If this TanStack Query version does not accept a function for `staleTime`, set `staleTime: 0` and add `refetchOnMount: 'always'` only when the cached value is locked, using a `select`-free wrapper in the hook.

- [ ] **Step 6: Update the wrapper**

```tsx
// src/components/lesson-material/lesson-material-wrapper.tsx
import { useRef } from 'react';
import { lessonMaterialRef } from '#/atoms/lesson-ai-test';
import { useLessonMaterial } from '#/hooks/data/use-lesson-material';
import { LessonMaterialView } from './lesson-material';
import { LessonMaterialSkeleton } from './lesson-material-skeleton';
import { MaterialLocked } from './parts/material-locked';

type LessonMaterialWrapperProps = {
  lessonSlug: string;
  courseSlug: string;
};

export const LessonMaterialWrapper = ({
  lessonSlug,
  courseSlug,
}: LessonMaterialWrapperProps) => {
  const { data, isLoading, isError } = useLessonMaterial(lessonSlug);
  const tabsRef = useRef<HTMLDivElement>(null);

  lessonMaterialRef.current = tabsRef.current;

  if (isLoading) return <LessonMaterialSkeleton />;
  if (isError || !data) return null;
  if (data.locked) return <MaterialLocked lock={data} courseSlug={courseSlug} />;

  return <LessonMaterialView material={data.material} tabsRef={tabsRef} />;
};
```

Thread `courseSlug` from `lesson-main.tsx`'s `renderLessonMaterialSlot` and from `LessonMainState`.

- [ ] **Step 7: Fix the other `useLessonMaterial` consumer**

`src/components/lesson-main/parts/lesson-player-container.tsx:37` destructures `material.keyPoints` / `material.text`. Update it to read through the union:

```ts
  const { data } = useLessonMaterial(lessonSlug);
  const material = data && !data.locked ? data.material : null;
```

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/lesson-material src/atoms/lesson-material.ts src/components/lesson-main
git commit -m "feat(gating): explain a locked material panel

Every locked branch names its reason and links to the lesson that clears
it. Locked responses are never cached stale.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Locked lesson page

**Files:**
- Create: `src/components/lesson-main/parts/lesson-locked.tsx`
- Modify: `src/components/lesson-main/types.ts`, `compute-lesson-main-state.ts`, `lesson-main.tsx`, `lesson-main-wrapper.tsx`
- Test: `src/components/lesson-main/__tests__/compute-lesson-main-state.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's `LessonLock`; the material query's locked response
- Produces: `LessonMainState` gains `{ kind: 'locked'; lessonName: string; lock: LockedMaterialResponse; courseSlug: string }`

Implements decision 16. The material response is the single signal: when it reports a `lesson` or `module` reason, the whole page is locked and the player is not rendered — so the video route is never called for a locked lesson.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/components/lesson-main/__tests__/compute-lesson-main-state.test.ts
  it('locks the whole page when the material reports a prerequisite gate', () => {
    const state = computeLessonMainState({
      course: { data: courseFixture, isLoading: false, isError: false },
      moduleSlug: 'm1',
      lessonSlug: 'b',
      courseSlug: 'c1',
      video: { data: undefined, isError: false },
      material: {
        data: {
          locked: true,
          reason: 'lesson',
          blockedBy: { lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
        },
        isLoading: false,
      },
      onRetryCourse: () => {},
      onRetryVideo: () => {},
    });

    // A prerequisite-locked lesson must not render the player at all: if the
    // student can watch the whole video, the sequencing did not happen.
    expect(state.kind).toBe('locked');
  });

  it('does not lock the page for a video-only gate', () => {
    const state = computeLessonMainState({
      course: { data: courseFixture, isLoading: false, isError: false },
      moduleSlug: 'm1',
      lessonSlug: 'b',
      courseSlug: 'c1',
      video: { data: undefined, isError: false },
      material: { data: { locked: true, reason: 'video' }, isLoading: false },
      onRetryCourse: () => {},
      onRetryVideo: () => {},
    });

    // The video gate locks material only — the video is how it is satisfied.
    expect(state.kind).toBe('ready');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/lesson-main/__tests__/compute-lesson-main-state.test.ts`
Expected: FAIL — `computeLessonMainState` does not accept `material`

- [ ] **Step 3: Extend the state type**

In `src/components/lesson-main/types.ts`:

```ts
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

export type LessonMainState =
  | { kind: 'course-loading' }
  | { kind: 'course-error'; message: string; onRetry: () => void }
  | { kind: 'not-found'; lessonSlug: string }
  | { kind: 'no-video'; lessonName: string }
  | {
      kind: 'locked';
      lessonName: string;
      courseSlug: string;
      lock: Extract<LockedMaterialResponse, { reason: 'lesson' | 'module' }>;
    }
  | {
      kind: 'ready';
      lessonName: string;
      lessonSlug: string;
      courseSlug: string;
      videoId: string;
      videoState: VideoFetchState;
    };
```

- [ ] **Step 4: Extend the computation**

In `compute-lesson-main-state.ts`, add `courseSlug: string` and a `material` query shape to `ComputeArgs`, and insert this immediately after the `not-found` check and before the `no-video` check:

```ts
  const materialData = material.data;
  if (
    materialData?.locked &&
    (materialData.reason === 'lesson' || materialData.reason === 'module')
  ) {
    return {
      kind: 'locked',
      lessonName: lesson.name,
      courseSlug,
      lock: materialData,
    };
  }
```

- [ ] **Step 5: Write the locked page component**

```tsx
// src/components/lesson-main/parts/lesson-locked.tsx
import { Lock } from 'lucide-react';
import type { LockedMaterialResponse } from '#/lib/lesson-gating';

type LessonLockedProps = {
  lessonName: string;
  courseSlug: string;
  lock: Extract<LockedMaterialResponse, { reason: 'lesson' | 'module' }>;
};

/**
 * A lesson the student has not reached yet: the player is not rendered, and
 * the reason names the lesson or module that clears it. Presentational and
 * hookless (see Global Constraints).
 */
export const LessonLocked = ({
  lessonName,
  courseSlug,
  lock,
}: LessonLockedProps) => (
  <section
    role="status"
    className="flex flex-col items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 px-6 py-16 text-center"
  >
    <span className="flex size-12 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      <Lock className="size-6" aria-hidden="true" />
    </span>
    <h2 className="text-lg font-medium text-primary">{lessonName} is locked</h2>
    {lock.reason === 'lesson' ? (
      <p className="text-sm text-secondary">
        Finish{' '}
        <a
          className="text-primary underline underline-offset-2"
          href={`/course/${courseSlug}/modules/${lock.blockedBy.moduleSlug}/lessons/${lock.blockedBy.lessonSlug}`}
        >
          {lock.blockedBy.lessonName}
        </a>{' '}
        to unlock this lesson.
      </p>
    ) : (
      <p className="text-sm text-secondary">
        Finish the {lock.blockedBy.moduleName} module to unlock this lesson.
      </p>
    )}
  </section>
);
```

- [ ] **Step 6: Render it**

Add a `case 'locked':` to `renderArticleBody` in `lesson-main.tsx` returning `<LessonLocked … />`, and pass `courseSlug` plus the material query through `lesson-main-wrapper.tsx` (it already has `courseSlug` as a prop; add `useLessonMaterial(lessonSlug)`).

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/lesson-main
git commit -m "feat(gating): lock the whole lesson page on a prerequisite gate

Prerequisite-locked lessons no longer render the player, so the video
route is never reached for them. The video gate still locks material only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Coverage notice instead of a dead debrief button

**Files:**
- Create: `src/components/video-player/parts/coverage-notice.tsx`
- Create: `src/components/video-player/parts/__tests__/coverage-notice.test.tsx`
- Modify: `src/components/lesson-main/parts/lesson-player-container.tsx`

**Interfaces:**
- Consumes: `useVideoProgress`, `milestones`, `watchedMilestones`
- Produces: `CoverageNotice({ hit, total })` presentational component

Implements decision 18. Today `DebriefOverlay` shows on `videoEnded` and `onDebrief` returns silently when material is locked — a button that does nothing, after a video that appeared to finish.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/video-player/parts/__tests__/coverage-notice.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverageNotice } from '../coverage-notice';

describe('CoverageNotice', () => {
  it('reports how much of the video has actually been watched', () => {
    render(<CoverageNotice hit={12} total={18} />);
    const text = screen.getByRole('status').textContent ?? '';
    // The student watched to the end by seeking; from their side the app looks
    // broken unless it says what is actually missing.
    expect(text).toContain('12');
    expect(text).toContain('18');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/video-player/parts/__tests__/coverage-notice.test.tsx`
Expected: FAIL — cannot resolve `../coverage-notice`

- [ ] **Step 3: Write the component**

```tsx
// src/components/video-player/parts/coverage-notice.tsx
type CoverageNoticeProps = {
  /** Watched-milestones the student has actually crossed. */
  hit: number;
  /** Watched-milestones required (every milestone except the final 100). */
  total: number;
};

/**
 * Shown when the video reaches the end but the student skipped part of it.
 * Without this they see a video that finished, nothing unlocked, and no
 * explanation — the one case where their mental model is confidently wrong.
 * Hookless presentational component (see Global Constraints).
 */
export const CoverageNotice = ({ hit, total }: CoverageNoticeProps) => (
  <div
    role="status"
    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-1/85 px-6 text-center"
  >
    <p className="text-base font-medium text-primary">You skipped ahead</p>
    <p className="text-sm text-secondary">
      You&rsquo;ve watched {hit} of {total} sections. Watch the parts you
      skipped to unlock this lesson&rsquo;s material.
    </p>
  </div>
);
```

- [ ] **Step 4: Wire it into the player container**

In `src/components/lesson-main/parts/lesson-player-container.tsx`, replace the overlay expression so the debrief only appears when the material is actually unlocked:

```tsx
  const { data: materialResponse } = useLessonMaterial(lessonSlug);
  const material =
    materialResponse && !materialResponse.locked ? materialResponse.material : null;
  const progress = useVideoProgress(videoId);
  const hit = progress.data?.milestonesHit.filter((m) => m !== 100).length ?? 0;
  const materialLocked = Boolean(materialResponse?.locked);

  const showCoverageNotice = videoEnded && materialLocked;
  const showDebrief = videoEnded && !materialLocked && !currentTest;
```

```tsx
      overlay={
        <AnimatePresence>
          {showCoverageNotice ? (
            <CoverageNotice hit={hit} total={watchedMilestones.length} />
          ) : showDebrief ? (
            <DebriefOverlay loading={isGenerating} onDebrief={onDebrief} />
          ) : null}
        </AnimatePresence>
      }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/video-player/parts src/components/lesson-main/parts/lesson-player-container.tsx
git commit -m "feat(gating): explain a skipped video instead of a dead debrief

The debrief overlay appeared whenever the video ended and its button
silently no-opped when material was locked. Report actual coverage.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Sidebar lock state

**Files:**
- Create: `src/components/sidebar/lesson-lock-icon.tsx`
- Modify: `src/components/sidebar/course-sidebar-wrapper.tsx`, `course-sidebar.tsx`, `module-accordion.tsx`, `module-item.tsx`, `lesson-list.tsx`, `lesson-link.tsx`
- Test: `src/components/sidebar/__tests__/sidebar-locks.test.ts` (create)

**Interfaces:**
- Consumes: Task 1's `evaluateLessonLock`, `evaluateMaterialLock`; existing `useCourseDetails`, `useCourseProgressSummary`
- Produces: `computeLessonLocks(details, progress): Record<string, LessonLock>` in `src/components/sidebar/compute-lesson-locks.ts`; `LessonLike` gains `lock?: LessonLock`

Implements decisions 19, 20, 21. Computed entirely on the client from data the sidebar already fetches — no new endpoint, and nothing per-user enters the Redis-cached course payload.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/sidebar/__tests__/sidebar-locks.test.ts
import { describe, expect, it } from 'vitest';
import { computeLessonLocks } from '../compute-lesson-locks';

const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'M1',
      dependsOn: [],
      lessons: [
        { id: 10, slug: 'a', name: 'A', isAvailable: true, videoId: 'v1', needsVideoWatch: true, dependsOn: [] },
        {
          id: 11,
          slug: 'b',
          name: 'B',
          isAvailable: true,
          videoId: 'v2',
          needsVideoWatch: true,
          dependsOn: [{ lessonSlug: 'a', moduleSlug: 'm1' }],
        },
      ],
    },
  ],
};

describe('computeLessonLocks', () => {
  it('locks a lesson whose prerequisite is unwatched', () => {
    const locks = computeLessonLocks(details, {
      lessons: [
        { lessonId: 10, watched: false },
        { lessonId: 11, watched: false },
      ],
    });
    expect(locks.b).toEqual({
      kind: 'lesson-locked',
      lessonSlug: 'a',
      moduleSlug: 'm1',
      lessonName: 'A',
    });
    expect(locks.a).toEqual({ kind: 'open' });
  });

  it('opens the lesson once the prerequisite is watched', () => {
    const locks = computeLessonLocks(details, {
      lessons: [
        { lessonId: 10, watched: true },
        { lessonId: 11, watched: false },
      ],
    });
    expect(locks.b).toEqual({ kind: 'open' });
  });

  it('returns an empty map when progress has not loaded', () => {
    expect(computeLessonLocks(details, undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/sidebar/__tests__/sidebar-locks.test.ts`
Expected: FAIL — cannot resolve `../compute-lesson-locks`

- [ ] **Step 3: Write the computation**

```ts
// src/components/sidebar/compute-lesson-locks.ts
import { evaluateLessonLock, type LessonLock } from '#/lib/lesson-gating';
import { toGateCourse, watchedLessonSlugs } from './gate-inputs';

/**
 * Lock state per lesson slug, for the sidebar.
 *
 * Computed on the client from data already fetched — the course payload and
 * the progress summary — so this needs no new endpoint and, critically, no
 * per-user data in getCourseDetailsWithCache, whose Redis entry is keyed by
 * course slug and shared across every student.
 *
 * The server still enforces. This exists so a student never has to click into
 * a lesson to discover it was locked.
 */
export function computeLessonLocks(
  details: Parameters<typeof toGateCourse>[0] | undefined,
  progress: { lessons: readonly { lessonId: number; watched: boolean }[] } | undefined,
): Record<string, LessonLock> {
  if (!details || !progress) return {};
  const course = toGateCourse(details);
  const watched = watchedLessonSlugs(details, progress);
  const locks: Record<string, LessonLock> = {};
  for (const module of course.modules) {
    for (const lesson of module.lessons) {
      locks[lesson.slug] = evaluateLessonLock(course, lesson.slug, watched);
    }
  }
  return locks;
}
```

Move `toGateCourse` and `watchedLessonSlugs` out of `lesson-gating.server.ts` into a new client-safe `src/components/sidebar/gate-inputs.ts` — or better, into `src/lib/lesson-gating.ts` itself, and have `lesson-gating.server.ts` re-export them. Prefer the latter: they are pure, and one home avoids drift. If you move them, update Task 4's imports.

- [ ] **Step 4: Render the lock**

```tsx
// src/components/sidebar/lesson-lock-icon.tsx
import { Lock } from 'lucide-react';

type LessonLockIconProps = {
  /** Why the lesson is locked — becomes the accessible name. */
  reason: string;
};

/**
 * The lock marker on a sidebar row. `reason` is a full sentence, not "Locked":
 * the reason must be available to a screen reader and must not be hover-only.
 */
export const LessonLockIcon = ({ reason }: LessonLockIconProps) => (
  <span
    className="shrink-0 text-tertiary"
    title={reason}
    aria-label={reason}
    role="img"
  >
    <Lock className="size-3.5" aria-hidden="true" />
  </span>
);
```

Thread `locks` from `course-sidebar-wrapper.tsx` (which already holds both queries) down through `CourseSidebar` → `ModuleAccordion` → `ModuleItem` → `LessonList` → `LessonLink` as `lessonLocks: Record<string, LessonLock>`. In `LessonLink`, render `LessonLockIcon` when the lesson's lock is not `open`, with the reason string built as:
- `lesson-locked` → `Finish ${lock.lessonName} first`
- `module-locked` → `Finish the ${lock.moduleName} module first`

Also append the same sentence to the row's visible text at `text-xs text-tertiary` so it is not icon-only.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar
git commit -m "feat(gating): show lock state and reason in the sidebar

Computed client-side from the course payload and progress summary already
fetched — no new endpoint, and no per-user data in the shared Redis cache.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: End-to-end verification against real data

**Files:** none changed unless a defect is found

- [ ] **Step 1: Full suite, typecheck, lint**

```bash
npx vitest run && npx tsc --noEmit && npx biome check src
```

- [ ] **Step 2: Confirm the three unsatisfiable-gate classes are handled**

Run against the dev database and confirm each query's lessons are reachable in the app:

```bash
psql "$DATABASE_URL" -c "
select l.slug, l.needs_video_watch, l.video_id is not null as has_video
from lessons l where l.needs_video_watch and l.video_id is null;"
```
Expected: 20 rows, and every one of them opens with unlocked material.

```bash
psql "$DATABASE_URL" -c "
with deps as (
  select l.slug as lesson, jsonb_array_elements(ld.depends_on)->>'lessonSlug' as prereq
  from lesson_dependencies ld join lessons l on l.id = ld.lesson_id)
select d.lesson, d.prereq from deps d join lessons p on p.slug = d.prereq
where p.is_available = false;"
```
Expected: 5 rows, and `swiss-cheese` in particular is not permanently locked.

- [ ] **Step 3: Manually verify the anti-skip fix**

Open a lesson with a video, press `End`, and confirm: no milestones are recorded, the material stays locked, and the "You skipped ahead" notice appears with a coverage count below the total. Then watch the video through and confirm the material unlocks **without a page refresh**.

- [ ] **Step 4: Verify the chat no longer leaks**

With a student account on a locked lesson, ask the chat widget for that lesson's key points. Expected: it does not have them.

- [ ] **Step 5: Confirm the WIP lessons are gone**

Expected: 23 `is_available = false` lessons no longer appear in the sidebar, and each module's lessons are in rank order.

- [ ] **Step 6: Commit any fixes and open the PR**

```bash
git add -A ':!src/db/schema.ts' ':!package.json' ':!CLAUDE.md'
git commit -m "test(gating): end-to-end verification fixes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage.** Decisions 1–27 all map to tasks: 1/25/26 → Task 1; 2/4/22/23 → Task 1; 3/27 → Task 2; 5 → Task 7 (reuses `isVideoWatched`); 6/7 → Tasks 1, 5; 8/15 → Tasks 4, 5; 9/10 → Tasks 7, 8; 11 → Task 8; 12 → Task 10; 13/14 → Task 9; 16/17 → Tasks 6, 11; 18 → Task 12; 19/20/21 → Task 13; 24 (no kill switch) is satisfied by its absence. The assumed defaults (500 on gate error, gate-before-404, one panel not seven, accessible reason, admin note) are covered in Tasks 5, 10, 11, 13.

**Known gaps to watch during execution.**
- Task 9 Step 4 depends on `chat.ts` having a `courseSlug`/`userId` in scope. If it does not, that is a real blocker — surface it rather than reinstating a default slug.
- Task 10 Step 5 assumes this TanStack Query version accepts a function for `staleTime`; a fallback is written into the step.
- Task 13 Step 3 relocates `toGateCourse`/`watchedLessonSlugs` into `src/lib/lesson-gating.ts`; do that move in Task 13 and update Task 4's imports rather than duplicating them.

**Type consistency.** `LessonLock`, `MaterialLock`, `LockedMaterialResponse`, `LessonMaterialResponse<T>`, `GateCourse`, `GateLesson`, `GateModule` are defined once in Task 1 and imported everywhere after. `evaluateLessonGate` returns `LessonGateResult | null` in Tasks 4, 5, 6. `useMilestoneReporter` takes `(playerId, videoId, lessonSlug)` in Tasks 8 and 12.
