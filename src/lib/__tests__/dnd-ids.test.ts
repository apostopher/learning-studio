import { describe, expect, it } from 'vitest';
import {
  containerDndId,
  disciplineDndId,
  lessonDndId,
  libraryLessonDndId,
  moduleDndId,
  parseDndId,
} from '#/lib/dnd-ids';

describe('dnd id builders', () => {
  // Mutant: any builder returning e.g. `${prefix}_${id}` (wrong separator) or
  // dropping the prefix entirely would fail these.
  it('produce the expected prefixed string for each of the five kinds', () => {
    expect(moduleDndId(5)).toBe('module-5');
    expect(lessonDndId(5)).toBe('lesson-5');
    expect(containerDndId(5)).toBe('container-5');
    expect(libraryLessonDndId(5)).toBe('library-lesson-5');
    expect(disciplineDndId(5)).toBe('discipline-5');
  });

  // Mutant: a builder that ignores its argument entirely, e.g.
  // `moduleDndId = () => 'module-5'`, passes every assertion above (they all
  // happen to use the literal id 5). A second, distinct id per builder is
  // what forces the argument to actually reach the output.
  it('use the id passed in, not a hardcoded one', () => {
    expect(moduleDndId(0)).toBe('module-0');
    expect(moduleDndId(123)).toBe('module-123');
    expect(lessonDndId(0)).toBe('lesson-0');
    expect(lessonDndId(123)).toBe('lesson-123');
    expect(containerDndId(0)).toBe('container-0');
    expect(containerDndId(123)).toBe('container-123');
    expect(libraryLessonDndId(0)).toBe('library-lesson-0');
    expect(libraryLessonDndId(123)).toBe('library-lesson-123');
    expect(disciplineDndId(0)).toBe('discipline-0');
    expect(disciplineDndId(123)).toBe('discipline-123');
  });
});

describe('parseDndId round-trips', () => {
  // These hardcode the literal id string rather than piping a builder's
  // output back into the parser: if builder and parser were wrong in the
  // same direction (e.g. both used '_'), a round-trip through the builder
  // would still pass. The literal pins the actual wire format.

  it('parses a module id', () => {
    // Mutant: a parser that only ever returns type 'lesson' (or that never
    // reaches the 'module' branch) fails this.
    expect(parseDndId('module-5')).toEqual({ type: 'module', id: 5 });
  });

  it('parses a lesson id', () => {
    expect(parseDndId('lesson-5')).toEqual({ type: 'lesson', id: 5 });
  });

  it('parses a container id', () => {
    expect(parseDndId('container-5')).toEqual({ type: 'container', id: 5 });
  });

  it('parses a discipline id', () => {
    // Mutant: whitelisting only the original three prefixes (pre-widening)
    // makes this null instead of a 'discipline' result.
    expect(parseDndId('discipline-5')).toEqual({ type: 'discipline', id: 5 });
  });

  it('parses a library-lesson id as "library-lesson", not "lesson"', () => {
    // Mutant: the CURRENT implementation, `String(id).split('-')` taking
    // [prefix, rest] = the first two pieces. For 'library-lesson-5' that
    // yields prefix 'library' (not whitelisted) and rest 'lesson', so
    // Number('lesson') is NaN and the whole call returns null — a library
    // lesson id would silently fail to parse at all. Splitting on the LAST
    // hyphen fixes this; this assertion goes red against the un-fixed
    // first-hyphen split (it gets null, not a match).
    const parsed = parseDndId('library-lesson-5');
    expect(parsed).toEqual({ type: 'library-lesson', id: 5 });
  });

  it('gives a library-lesson id the type "library-lesson", spelled out on its own', () => {
    // This narrows in on one field of the previous test's `toEqual` result —
    // it does NOT independently kill a mutant the previous test misses. In
    // particular, the historical bug this file's header describes (first-hyphen
    // split, `parseDndId('library-lesson-5')` returns `null`) already fails
    // the previous `toEqual({ type: 'library-lesson', id: 5 })` assertion, so
    // this `not.toBe('lesson')` check passes against that bug too (`undefined
    // !== 'lesson'`) and adds no coverage of its own beyond restating the
    // type half of the sibling assertion. It stays as a readable, named pin
    // of that one field — not a claim of separate mutant coverage.
    const parsed = parseDndId('library-lesson-5');
    expect(parsed?.type).not.toBe('lesson');
  });
});

describe('parseDndId rejects invalid ids', () => {
  it('returns null for an unknown prefix', () => {
    // Mutant: a parser that falls back to some default type instead of null
    // for an unrecognised prefix.
    expect(parseDndId('widget-5')).toBeNull();
  });

  it('returns null for a non-integer suffix', () => {
    // Mutant: a parser that skips the Number.isInteger guard and returns
    // { type: 'lesson', id: NaN }.
    expect(parseDndId('lesson-abc')).toBeNull();
  });

  it('returns null for an id with no hyphen at all', () => {
    // NOT a live mutant for the `if (at === -1) return null` guard in the
    // current implementation: with that guard removed, `at` stays -1, so
    // `prefix = raw.slice(0, -1)` becomes 'lesso' (all but the last char) and
    // `num = Number(raw.slice(0))` becomes `Number('lesson')`, which is NaN —
    // the `Number.isInteger` guard below still catches it and returns null
    // either way. (The only strings for which `raw.slice(0)` parses as an
    // integer are all-numeric, and slicing the last char off an all-numeric
    // string can never produce one of the whitelisted alphabetic prefixes, so
    // there is no input that makes the two guards disagree here.) This
    // assertion still pins the observable contract — "no hyphen → null" — it
    // just does not, by itself, distinguish the explicit guard from the
    // numeric one; that would need a parser shape where a hyphen-less string
    // resolves to a *different* slice (e.g. one that treats the whole string
    // as the prefix with an empty, zero-parsing suffix), which this
    // implementation does not have.
    expect(parseDndId('lesson')).toBeNull();
  });

  it('returns null for a float suffix', () => {
    // Decision: DB ids are integers (serial/bigserial columns), so a float
    // suffix is never a valid id. Number.isInteger(5.5) is false, so this is
    // already covered by the existing guard — pinned here so a regression
    // that loosens the guard (e.g. swapping Number.isInteger for a bare
    // truthy/NaN check) goes red.
    expect(parseDndId('lesson-5.5')).toBeNull();
  });

  it('returns null for a negative suffix', () => {
    // Decision: DB ids are never negative, so this should never round-trip.
    // Building `lesson-${-5}` produces the literal string 'lesson--5'.
    // Splitting on the LAST hyphen puts the second '-' at the split point,
    // giving prefix 'lesson-' (trailing hyphen, not whitelisted) and suffix
    // '5' — so this returns null because the PREFIX fails to match, not
    // because of the numeric guard. Pinned as null either way: a negative
    // id is invalid input, and the fix for the library-lesson bug must not
    // accidentally make negative ids parse (e.g. by whitelisting prefixes
    // with a trailing hyphen stripped, or by splitting on the first hyphen
    // instead of the last).
    expect(parseDndId('lesson--5')).toBeNull();
  });
});
