import { describe, expect, it } from 'vitest';
import {
  containerDndId,
  courseDndId,
  disciplineDndId,
  lessonDndId,
  libraryContainerDndId,
  libraryLessonDndId,
  libraryModuleDndId,
  libraryUntitledDndId,
  moduleDndId,
  parseDndId,
} from '#/lib/dnd-ids';

/**
 * Course remixing puts the same module — and every lesson placed in it — on
 * two rails at once, so `module`/`lesson`/`container` ids are qualified by
 * course (`module-<courseId>-<moduleId>`) to stay unique inside the one
 * `DndContext` the editor's panes share. `library-lesson`/`discipline`/
 * `course` ids are already unique and stay single-numbered.
 */
describe('dnd id builders', () => {
  // Mutant: any builder returning e.g. `${prefix}_${id}` (wrong separator),
  // dropping a segment, or swapping the two rail arguments would fail these.
  it('produce the expected prefixed string for each of the six kinds', () => {
    expect(moduleDndId(2, 10)).toBe('module-2-10');
    expect(lessonDndId(2, 10)).toBe('lesson-2-10');
    expect(containerDndId(2, 10)).toBe('container-2-10');
    expect(libraryLessonDndId(5)).toBe('library-lesson-5');
    expect(disciplineDndId(5)).toBe('discipline-5');
    expect(courseDndId(5)).toBe('course-5');
  });

  // Mutant: a builder that ignores one of its arguments entirely, e.g.
  // `moduleDndId = (courseId) => \`module-${courseId}-5\``, passes an
  // assertion that only ever varies the OTHER argument. Varying both id and
  // courseId independently is what forces each argument to actually reach
  // the output.
  it('use both ids passed in, not a hardcoded one', () => {
    expect(moduleDndId(0, 0)).toBe('module-0-0');
    expect(moduleDndId(7, 123)).toBe('module-7-123');
    expect(lessonDndId(7, 123)).toBe('lesson-7-123');
    expect(containerDndId(7, 123)).toBe('container-7-123');
    expect(libraryLessonDndId(0)).toBe('library-lesson-0');
    expect(libraryLessonDndId(123)).toBe('library-lesson-123');
    expect(disciplineDndId(0)).toBe('discipline-0');
    expect(disciplineDndId(123)).toBe('discipline-123');
    expect(courseDndId(0)).toBe('course-0');
    expect(courseDndId(123)).toBe('course-123');
  });

  // Task 6: the three flat library-side kinds — a discipline module, its
  // lesson container, and a discipline's Untitled group. All three are
  // already unique across the whole library, with no course to qualify them
  // by, so they stay single-numbered like `library-lesson`/`discipline`.
  it('produce the expected prefixed string for each of the three library-side kinds', () => {
    expect(libraryModuleDndId(7)).toBe('library-module-7');
    expect(libraryContainerDndId(8)).toBe('library-container-8');
    expect(libraryUntitledDndId(4)).toBe('library-untitled-4');
  });

  it('gives the same module a different id in every course it is shown in', () => {
    // The whole point of qualifying rail ids: a remixed module renders on
    // two rails, and dnd-kit needs two distinct registrations.
    expect(moduleDndId(2, 10)).not.toBe(moduleDndId(6, 10));
    expect(lessonDndId(2, 10)).not.toBe(lessonDndId(6, 10));
    expect(containerDndId(2, 10)).not.toBe(containerDndId(6, 10));
  });
});

describe('parseDndId round-trips', () => {
  // These hardcode the literal id string rather than piping a builder's
  // output back into the parser: if builder and parser were wrong in the
  // same direction (e.g. both dropped the course segment), a round-trip
  // through the builder would still pass. The literal pins the actual wire
  // format.

  it('parses a module id with its course', () => {
    // Mutant: a parser that only ever returns type 'lesson' (or that never
    // reaches the 'module' branch) fails this.
    expect(parseDndId('module-2-10')).toEqual({
      type: 'module',
      courseId: 2,
      id: 10,
    });
  });

  it('parses a lesson id with its course', () => {
    expect(parseDndId('lesson-2-55')).toEqual({
      type: 'lesson',
      courseId: 2,
      id: 55,
    });
  });

  it('parses a container id with its course', () => {
    expect(parseDndId('container-6-10')).toEqual({
      type: 'container',
      courseId: 6,
      id: 10,
    });
  });

  it('parses a discipline id, unqualified by course', () => {
    // Mutant: whitelisting only the rail prefixes (pre-widening) makes this
    // null instead of a 'discipline' result.
    expect(parseDndId('discipline-5')).toEqual({ type: 'discipline', id: 5 });
  });

  it('parses a course id, unqualified by course', () => {
    expect(parseDndId('course-5')).toEqual({ type: 'course', id: 5 });
  });

  it('parses a library-lesson id as "library-lesson", not "lesson"', () => {
    // Mutant: the rail pattern (`<prefix>-<num>-<num>`) matching greedily
    // against a FLAT type name that itself contains a hyphen would misread
    // 'library-lesson-5' as prefix 'library' (unwhitelisted) — or, worse, as
    // a rail id with the courseId and id both wrong. The flat pattern must
    // win here, not the rail one.
    expect(parseDndId('library-lesson-5')).toEqual({
      type: 'library-lesson',
      id: 5,
    });
  });

  it('gives a library-lesson id the type "library-lesson", spelled out on its own', () => {
    expect(parseDndId('library-lesson-5')?.type).not.toBe('lesson');
  });

  it('round-trips the three new library-side kinds as flat kinds', () => {
    expect(parseDndId(libraryModuleDndId(7))).toEqual({
      type: 'library-module',
      id: 7,
    });
    expect(parseDndId(libraryContainerDndId(8))).toEqual({
      type: 'library-container',
      id: 8,
    });
    expect(parseDndId(libraryUntitledDndId(4))).toEqual({
      type: 'library-untitled',
      id: 4,
    });
  });

  it("parses 'library-module-7' as { type: 'library-module', id: 7 }", () => {
    // Pinned literally, not just via the builder: catches a rail/flat pattern
    // regression the same way the library-lesson literal test above does.
    expect(parseDndId('library-module-7')).toEqual({
      type: 'library-module',
      id: 7,
    });
  });
});

describe('parseDndId rejects invalid ids', () => {
  it('returns null for an unknown prefix', () => {
    // Mutant: a parser that falls back to some default type instead of null
    // for an unrecognised prefix.
    expect(parseDndId('widget-5')).toBeNull();
    expect(parseDndId('widget-2-5')).toBeNull();
  });

  it('rejects a rail id missing its course', () => {
    // The whole point of qualifying rail ids: a bare `module-10` no longer
    // says which column it belongs to, and must not silently parse as
    // "courseId undefined" or fall back to the flat shape.
    expect(parseDndId('module-10')).toBeNull();
    expect(parseDndId('lesson-10')).toBeNull();
    expect(parseDndId('container-10')).toBeNull();
  });

  it('returns null for a non-integer suffix', () => {
    expect(parseDndId('lesson-2-abc')).toBeNull();
    expect(parseDndId('discipline-abc')).toBeNull();
  });

  it('returns null for an id with no hyphen at all', () => {
    expect(parseDndId('lesson')).toBeNull();
  });

  it('returns null for a float suffix', () => {
    // Decision: DB ids are integers (serial/bigserial columns), so a float
    // suffix is never a valid id.
    expect(parseDndId('lesson-2-5.5')).toBeNull();
    expect(parseDndId('discipline-5.5')).toBeNull();
  });

  it('returns null for a negative suffix', () => {
    // Building `lesson-${courseId}-${-5}` produces the literal string
    // 'lesson-2--5' — the digit-only match cannot span the doubled hyphen,
    // so this is invalid input either way.
    expect(parseDndId('lesson-2--5')).toBeNull();
    expect(parseDndId('discipline--5')).toBeNull();
  });
});
