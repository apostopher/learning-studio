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

  it('does not confuse a library-lesson id with a placed lesson id', () => {
    // Mutant: a parser that maps any prefix containing 'lesson' to type
    // 'lesson' (e.g. `prefix.endsWith('lesson') ? 'lesson' : ...`) would
    // pass the previous test's shape check by coincidence if it also got the
    // id right, but this pins the type is specifically NOT 'lesson'.
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
    // Mutant: a parser using indexOf/split that treats a hyphen-less string
    // as prefix === the whole string, rest === '' → Number('') is 0, an
    // integer, so it would wrongly return { type: ..., id: 0 } if the
    // no-hyphen case weren't guarded explicitly.
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
