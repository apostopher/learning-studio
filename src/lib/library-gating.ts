/**
 * Pure library-gating: which of a course's library files a learner may
 * download, and what to tell them about the ones they may not.
 *
 * Like `lesson-gating.ts`, this has no DB, network, or React dependency — the
 * server imports it to ENFORCE (the download route re-runs it per click) and
 * the client imports it only for its types. See
 * docs/superpowers/specs/2026-08-02-student-library-ledger.md.
 *
 * The unlock rule is deliberately `isLessonSatisfied` and nothing else (D5):
 * the same predicate that gates lesson material. Using `percent === 100` would
 * turn section taps and quizzes into download requirements, which is exactly
 * what D19 of the completion ledger rejected — and would leave us with no
 * vocabulary to write the lock reason with.
 */

import {
  type GateCourse,
  type GateLesson,
  type GateModule,
  isLessonSatisfied,
} from '#/lib/lesson-gating';

/**
 * One `blob_file_assignments` row, reduced to slugs.
 *
 * `moduleSlug` and `lessonSlug` are both nullable and BOTH are commonly set:
 * 103 of the 114 imported rows carry a module and a lesson. When a lesson is
 * present the module is ignored entirely (D8) — see `resolveAssignment`.
 */
export type LibraryAssignment = {
  fileId: number;
  moduleSlug: string | null;
  lessonSlug: string | null;
};

/** A `blob_files` row, minus the URL — which never leaves the server (D10). */
export type LibraryFileInput = {
  id: number;
  name: string;
  size: number;
  type: string;
};

/**
 * Why a file is locked, carrying everything the tile needs to explain itself
 * and link onward (D16/D17). Mirrors `LessonLock`'s shape so the two read the
 * same way, but is a separate type: a library file can be module-locked
 * without any lesson being involved, which `LessonLock` cannot express.
 */
export type LibraryLock =
  | { kind: 'open' }
  | {
      kind: 'lesson-locked';
      lessonName: string;
      lessonSlug: string;
      moduleSlug: string;
    }
  | { kind: 'module-locked'; moduleName: string; moduleSlug: string };

export type LibraryFile = LibraryFileInput & { lock: LibraryLock };

const OPEN: LibraryLock = { kind: 'open' };

type LessonSite = { lesson: GateLesson; module: GateModule; position: number };

/**
 * Course-wide position of every lesson, and of every module via its first
 * lesson, so "earliest" has one definition for both ordering and lock choice.
 *
 * Modules arrive in rank order and each module's lessons likewise, so array
 * position IS rank order — the same assumption `lessonPositions` makes in
 * lesson-gating.ts.
 */
function indexCourse(course: GateCourse) {
  const lessonSites = new Map<string, LessonSite>();
  const modules = new Map<string, { module: GateModule; position: number }>();
  let position = 0;

  for (const module of course.modules) {
    modules.set(module.slug, { module, position });
    for (const lesson of module.lessons) {
      lessonSites.set(lesson.slug, { lesson, module, position });
      position += 1;
    }
    // A module with no lessons still consumes a position, so an empty module
    // does not make the module after it share a position with the one before.
    if (module.lessons.length === 0) position += 1;
  }

  return { lessonSites, modules };
}

type ResolvedAssignment = { lock: LibraryLock; position: number };

/**
 * One assignment → a lock, or `null` meaning "this row does not describe
 * anything a student can see".
 *
 * `null` is returned rather than a lock for three cases, all of which mean the
 * target is absent from the gate course. `getCourseDetailsWithCache` strips
 * WIP lessons before we ever see them, so "not found" covers a lesson that is
 * `is_available = false`, one that was deleted, and one whose slug was
 * rewritten — and D9 says all three should vanish from the library rather than
 * appear. Critically it must NOT fall through to `isLessonSatisfied`, whose
 * `!isAvailable` escape answers "satisfied": correct when asking whether a
 * lesson can BLOCK something, catastrophic when the thing being gated is the
 * content itself, because unpublished material would unlock for everyone.
 */
function resolveAssignment(
  assignment: LibraryAssignment,
  index: ReturnType<typeof indexCourse>,
  watchedLessonSlugs: ReadonlySet<string>,
): ResolvedAssignment | null {
  // D8: when a lesson is named, the stored module is ignored. `lessons.slug`
  // is globally unique, and lesson-gating.ts already rules that resolving
  // through the stored module is "redundant and actively harmful" — three
  // imported rows name a module the lesson does not live in, and honouring
  // them is what locked those files forever in the old repo.
  if (assignment.lessonSlug !== null) {
    const site = index.lessonSites.get(assignment.lessonSlug);
    if (!site) return null;
    return {
      position: site.position,
      lock: isLessonSatisfied(site.lesson, watchedLessonSlugs)
        ? OPEN
        : {
            kind: 'lesson-locked',
            lessonName: site.lesson.name,
            lessonSlug: site.lesson.slug,
            moduleSlug: site.module.slug,
          },
    };
  }

  if (assignment.moduleSlug !== null) {
    const found = index.modules.get(assignment.moduleSlug);
    if (!found) return null;
    // A module whose lessons are all WIP arrives here with an empty `lessons`
    // array, and `every` on an empty array is vacuously true — which would
    // unlock the file. Same leak as the lesson case, same answer: hide it.
    if (found.module.lessons.length === 0) return null;
    const allSatisfied = found.module.lessons.every((lesson) =>
      isLessonSatisfied(lesson, watchedLessonSlugs),
    );
    return {
      position: found.position,
      lock: allSatisfied
        ? OPEN
        : {
            kind: 'module-locked',
            moduleName: found.module.name,
            moduleSlug: found.module.slug,
          },
    };
  }

  // Neither set: a course-wide assignment. None exist — the import skipped
  // them deliberately — and `course_id` is null on every row, so there is
  // nothing to scope one by. Dropped rather than opened; the admin UI that
  // creates the first one will set `course_id` and this branch gets written
  // then, against real data.
  return null;
}

/**
 * Resolve a course's library files against one learner's progress.
 *
 * Files whose every assignment resolved to `null` are omitted entirely, not
 * returned locked (D9).
 */
export function resolveLibraryFiles({
  files,
  assignments,
  course,
  watchedLessonSlugs,
}: {
  files: readonly LibraryFileInput[];
  assignments: readonly LibraryAssignment[];
  course: GateCourse;
  watchedLessonSlugs: ReadonlySet<string>;
}): LibraryFile[] {
  const index = indexCourse(course);

  const resolvedByFile = new Map<number, ResolvedAssignment[]>();
  for (const assignment of assignments) {
    const resolved = resolveAssignment(assignment, index, watchedLessonSlugs);
    if (!resolved) continue;
    const existing = resolvedByFile.get(assignment.fileId);
    if (existing) existing.push(resolved);
    else resolvedByFile.set(assignment.fileId, [resolved]);
  }

  const out: (LibraryFile & { position: number })[] = [];
  for (const file of files) {
    const resolved = resolvedByFile.get(file.id);
    if (!resolved || resolved.length === 0) continue;

    // D7: ANY satisfied assignment unlocks the file. Assignments mark where a
    // file is RELEVANT, not a set of conditions to clear — the same PDF cited
    // from two lessons is earned by finishing either. ALL-semantics would also
    // let adding an assignment revoke a file a learner already had.
    const openOne = resolved.find((r) => r.lock.kind === 'open');

    // Earliest position decides both where the file sits in the grid and,
    // when it is locked, WHICH lock is shown — so a file cited from three
    // unfinished lessons names the one the learner will reach first.
    const earliest = resolved.reduce((a, b) =>
      b.position < a.position ? b : a,
    );

    out.push({
      ...file,
      lock: openOne ? OPEN : earliest.lock,
      position: earliest.position,
    });
  }

  // D14: unlocked first, as the old page did. Then course order, so a flat
  // grid still reads module by module, with name as a stable final tiebreak
  // (two files can share a position when both hang off the same lesson).
  out.sort((a, b) => {
    const aOpen = a.lock.kind === 'open' ? 0 : 1;
    const bOpen = b.lock.kind === 'open' ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    if (a.position !== b.position) return a.position - b.position;
    const byName = a.name.localeCompare(b.name);
    return byName !== 0 ? byName : a.id - b.id;
  });

  return out.map(({ position: _position, ...file }) => file);
}

/**
 * Whether this learner may download this file right now — the single question
 * the download route asks. Deliberately re-derived from the same function the
 * page renders from, so the two cannot disagree.
 */
export function canDownloadLibraryFile(
  fileId: number,
  resolved: readonly LibraryFile[],
): boolean {
  return resolved.some((f) => f.id === fileId && f.lock.kind === 'open');
}
