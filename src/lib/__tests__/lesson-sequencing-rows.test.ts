import { describe, expect, it } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import {
  buildSequencingRows,
  toGateCourseFromBoard,
} from '#/lib/lesson-sequencing-rows';

const lesson = (
  id: number,
  slug: string,
  over: Partial<BoardLesson> = {},
): BoardLesson => ({
  id,
  name: slug,
  slug,
  rank: id,
  isAvailable: true,
  hasDebrief: false,
  needsVideoWatch: true,
  requiredSubscriptions: [],
  isConfigured: true,
  quizQuestionCount: 0,
  dependsOn: [],
  videoProvider: 'mux',
  videoRef: 'ref',
  ...over,
});

const board = (lessons: BoardLesson[], sequential = true): BoardModule[] => [
  {
    id: 1,
    name: 'M',
    slug: 'm',
    imageUrlAvif: null,
    imageUrlWebp: null,
    rank: 1,
    requiredSubscriptions: [],
    dependsOn: [],
    sequentialLessons: sequential,
    learnerCount: 0,
    lessons,
  },
];

const rowsFor = (modules: BoardModule[]) =>
  buildSequencingRows(toGateCourseFromBoard(modules), modules[0]);

describe('buildSequencingRows', () => {
  it('names the chained prerequisite and says nothing more', () => {
    const rows = rowsFor(board([lesson(1, 'a'), lesson(2, 'b')]));
    expect(rows[1].prerequisites.map((p) => p.slug)).toEqual(['a']);
    expect(rows[1].source).toBe('chain');
    // Chained to the lesson right before it needs no explanation.
    expect(rows[1].note).toBeNull();
  });

  it('calls out the first lesson', () => {
    const rows = rowsFor(board([lesson(1, 'a')]));
    expect(rows[0].note).toMatch(/first lesson/i);
  });

  it('explains a skip, naming the lesson passed over and why', () => {
    // The whole reason this screen exists: without the note, an admin has no
    // way to learn the chain jumped a lesson.
    const rows = rowsFor(
      board([
        lesson(1, 'a'),
        lesson(2, 'reading', { isConfigured: false }),
        lesson(3, 'c'),
      ]),
    );
    expect(rows[2].prerequisites.map((p) => p.slug)).toEqual(['a']);
    expect(rows[2].note).toMatch(/skips reading/i);
    expect(rows[2].note).toMatch(/no video/i);
  });

  it('says so when nothing before a lesson can gate it', () => {
    const rows = rowsFor(
      board([lesson(1, 'reading', { isConfigured: false }), lesson(2, 'b')]),
    );
    expect(rows[1].prerequisites).toEqual([]);
    expect(rows[1].note).toMatch(/opens straight away/i);
  });

  it('explains an ignored forward override', () => {
    const rows = rowsFor(
      board([
        lesson(1, 'a', { dependsOn: [{ lessonSlug: 'b' }] }),
        lesson(2, 'b'),
      ]),
    );
    expect(rows[0].prerequisites).toEqual([]);
    expect(rows[0].note).toMatch(/comes later/i);
    expect(rows[0].note).toMatch(/nothing gates this lesson/i);
  });

  it('reports any-order modules once the chain is off', () => {
    const rows = rowsFor(board([lesson(1, 'a'), lesson(2, 'b')], false));
    expect(rows[1].source).toBe('none');
    expect(rows[1].note).toMatch(/any order/i);
  });

  it('offers only earlier lessons to the override picker', () => {
    // Not the safety mechanism — the gate drops forward edges regardless —
    // but it stops the common path creating an edge that is dead on save.
    const rows = rowsFor(
      board([lesson(1, 'a'), lesson(2, 'b'), lesson(3, 'c')]),
    );
    expect(rows[0].optionSlugs).toEqual([]);
    expect(rows[1].optionSlugs).toEqual(['a']);
    expect(rows[2].optionSlugs).toEqual(['a', 'b']);
  });

  it('numbers rows from one, in board order', () => {
    const rows = rowsFor(board([lesson(1, 'a'), lesson(2, 'b')]));
    expect(rows.map((r) => r.position)).toEqual([1, 2]);
  });
});
