import { describe, expect, it } from 'vitest';
import { filterUserRows, type UserRow } from '../users-table';

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
