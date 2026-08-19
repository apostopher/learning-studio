import { describe, expect, it } from 'vitest';
import { emptyReason, filterUserRows, type UserRow } from '../users-table';

const row = (overrides: Partial<UserRow> = {}): UserRow => ({
  kind: 'user',
  profileId: 1,
  email: 'pilot@example.com',
  name: 'Pat Pilot',
  roles: [],
  courses: [{ id: 1, name: 'ITPS Basics' }],
  levels: { 1: 'basic' },
  joinedAt: '2026-01-01T00:00:00Z',
  firstName: 'Pat',
  lastName: 'Pilot',
  callSign: null,
  phoneNumber: null,
  ...overrides,
});

describe('filterUserRows', () => {
  it('returns every row when neither course nor level is chosen', () => {
    const rows = [
      row({ levels: { 1: 'basic' } }),
      row({ levels: { 1: 'advanced' } }),
    ];

    const result = filterUserRows(rows, {
      search: '',
      courseId: null,
      level: null,
    });

    expect(result).toHaveLength(2);
  });

  it('does not filter on course alone — a level is required too', () => {
    const rows = [
      row({ levels: { 1: 'basic' } }),
      row({ levels: { 1: 'advanced' } }),
    ];

    const result = filterUserRows(rows, {
      search: '',
      courseId: 1,
      level: null,
    });

    expect(result).toHaveLength(2);
  });

  it('does not filter on level alone — a course is required too', () => {
    const rows = [
      row({ levels: { 1: 'basic' } }),
      row({ levels: { 1: 'advanced' } }),
    ];

    const result = filterUserRows(rows, {
      search: '',
      courseId: null,
      level: 'basic',
    });

    expect(result).toHaveLength(2);
  });

  it('matches rows at the chosen level in the chosen course', () => {
    const target = row({ name: 'At Basic', levels: { 1: 'basic' } });
    const other = row({ name: 'At Advanced', levels: { 1: 'advanced' } });

    const result = filterUserRows([target, other], {
      search: '',
      courseId: 1,
      level: 'basic',
    });

    expect(result).toEqual([target]);
  });

  it('excludes a pilot with no level row for the selected course, even if they have one for another course', () => {
    const notEnrolledInCourse2 = row({
      name: 'Only in course 1',
      levels: { 1: 'basic' },
    });

    const result = filterUserRows([notEnrolledInCourse2], {
      search: '',
      courseId: 2,
      level: 'basic',
    });

    expect(result).toEqual([]);
  });

  it('excludes pending rows, whose levels are always empty', () => {
    const pending = row({
      kind: 'pending',
      profileId: null,
      name: '',
      levels: {},
    });

    const result = filterUserRows([pending], {
      search: '',
      courseId: 1,
      level: 'basic',
    });

    expect(result).toEqual([]);
  });

  it('does not crash on a pending row when no filter is active', () => {
    const pending = row({ kind: 'pending', profileId: null, levels: {} });

    const result = filterUserRows([pending], {
      search: '',
      courseId: null,
      level: null,
    });

    expect(result).toEqual([pending]);
  });

  it('composes with the search term — both must match', () => {
    const basicMatchingSearch = row({
      name: 'Alex Basic',
      levels: { 1: 'basic' },
    });
    const basicNotMatchingSearch = row({
      name: 'Sam Someone',
      levels: { 1: 'basic' },
    });

    const result = filterUserRows(
      [basicMatchingSearch, basicNotMatchingSearch],
      { search: 'alex', courseId: 1, level: 'basic' },
    );

    expect(result).toEqual([basicMatchingSearch]);
  });

  it('search still filters when the course/level filter is inactive', () => {
    const matching = row({ name: 'Alex' });
    const notMatching = row({ name: 'Sam' });

    const result = filterUserRows([matching, notMatching], {
      search: 'alex',
      courseId: null,
      level: null,
    });

    expect(result).toEqual([matching]);
  });
});

/**
 * The empty state is the only thing on screen when the table is empty, so it
 * is the only thing that can tell an admin why. It used to always say "try a
 * different search term" — advice nobody can act on when the search box is
 * empty and it is the URL's course+level filter that emptied the table.
 */
describe('emptyReason', () => {
  it('names the course and level when no search term was typed', () => {
    expect(
      emptyReason({ search: '', courseName: 'ITPS Basics', level: 'advanced' }),
    ).toBe(
      'Nobody is at Advanced in ITPS Basics. Clear the course filter to see everyone.',
    );
  });

  it('names the course alone when only the course filter is set', () => {
    expect(
      emptyReason({ search: '  ', courseName: 'ITPS Basics', level: null }),
    ).toBe(
      'Nobody is enrolled in ITPS Basics. Clear the course filter to see everyone.',
    );
  });

  it('mentions both causes when a search and a filter are both in force', () => {
    expect(
      emptyReason({
        search: ' pat ',
        courseName: 'ITPS Basics',
        level: 'basic',
      }),
    ).toBe(
      'Nobody matching “pat” is at Basic in ITPS Basics. Try a different search term, or clear the course filter.',
    );
  });

  it('falls back to the search advice when the search really is the only filter', () => {
    expect(
      emptyReason({ search: 'pat', courseName: undefined, level: null }),
    ).toBe('Try a different search term.');
  });
});
