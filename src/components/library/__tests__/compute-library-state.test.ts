import { describe, expect, it } from 'vitest';
import type { LibraryFile } from '#/lib/library-gating';
import { computeLibraryState } from '../compute-library-state';

const open = (id: number): LibraryFile => ({
  id,
  name: `f${id}`,
  size: 1,
  type: 'application/pdf',
  lock: { kind: 'open' },
});

const locked = (id: number): LibraryFile => ({
  id,
  name: `f${id}`,
  size: 1,
  type: 'application/pdf',
  lock: {
    kind: 'lesson-locked',
    lessonName: 'l',
    lessonSlug: 'l',
    moduleSlug: 'm',
  },
});

const compute = (o: Partial<Parameters<typeof computeLibraryState>[0]> = {}) =>
  computeLibraryState({
    isLoading: false,
    isError: false,
    files: [],
    ...o,
  });

describe('computeLibraryState', () => {
  it('is loading while the first fetch is in flight', () => {
    expect(compute({ isLoading: true, files: undefined }).kind).toBe('loading');
  });

  it('is loading when data has not arrived, even if not flagged loading', () => {
    expect(compute({ files: undefined }).kind).toBe('loading');
  });

  it('is an error when the first fetch failed', () => {
    expect(compute({ isError: true, files: undefined }).kind).toBe('error');
  });

  /**
   * A background refetch that fails leaves isError true while good data is
   * still cached. Blanking the page to an error there would throw away a
   * perfectly renderable library.
   */
  it('keeps showing files when a REFETCH fails', () => {
    expect(compute({ isError: true, files: [open(1)] }).kind).toBe('files');
  });

  it('is empty when the course has no library files', () => {
    expect(compute({ files: [] }).kind).toBe('empty');
  });

  it('reports counts for a mixed library', () => {
    expect(compute({ files: [open(1), locked(2), locked(3)] })).toMatchObject({
      kind: 'files',
      total: 3,
      unlocked: 1,
      allLocked: false,
    });
  });

  it('flags allLocked when nothing is earned yet', () => {
    expect(compute({ files: [locked(1), locked(2)] })).toMatchObject({
      kind: 'files',
      unlocked: 0,
      allLocked: true,
    });
  });

  it('does not flag allLocked for an empty library — that is a different state', () => {
    expect(compute({ files: [] }).kind).toBe('empty');
  });

  it('does not flag allLocked when everything is unlocked', () => {
    expect(compute({ files: [open(1)] })).toMatchObject({
      unlocked: 1,
      allLocked: false,
    });
  });
});
