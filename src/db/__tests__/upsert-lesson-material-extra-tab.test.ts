// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `upsertLessonMaterial` writes only the closing field the lesson's
 * discipline shows. Asserted on the row handed to `insert().values()` — the
 * thing the database actually receives — because an imported doc can carry
 * both a Job of the Day and a TEST THIS! section, and whichever one has no
 * tab must never reach the table.
 */
const state = vi.hoisted(() => ({
  lessonRows: [] as Array<{ slug: string; disciplineSlug: string | null }>,
  inserted: [] as unknown[],
}));

vi.mock('#/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where']) {
      c[m] = () => c;
    }
    c.limit = async () => state.lessonRows;
    return c;
  };
  return {
    db: {
      select: () => chain(),
      transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          delete: () => ({ where: async () => undefined }),
          insert: () => ({
            values: (row: unknown) => {
              state.inserted.push(row);
              return { returning: async () => [row] };
            },
          }),
        }),
    },
  };
});

const { upsertLessonMaterial } = await import('#/db/lesson');

const material = {
  text: '<p>body</p>',
  keyPoints: [],
  proTips: '',
  quiz: [],
  jobOfTheDay: 'https://example.com/job',
  testThis: [{ name: 'Try', url: 'https://example.com/try' }],
};

beforeEach(() => {
  state.inserted.length = 0;
});

describe('upsertLessonMaterial closing field', () => {
  it('keeps Job of the Day and drops TEST THIS! on a 3D Airmanship lesson', async () => {
    state.lessonRows = [{ slug: 'l-3d', disciplineSlug: '3d-airmanship' }];
    await upsertLessonMaterial(1, material);
    expect(state.inserted[0]).toMatchObject({
      lessonSlug: 'l-3d',
      jobOfTheDay: 'https://example.com/job',
      testThis: null,
    });
  });

  it('keeps TEST THIS! and drops Job of the Day on any other lesson', async () => {
    state.lessonRows = [{ slug: 'l-uas', disciplineSlug: 'uas' }];
    await upsertLessonMaterial(1, material);
    expect(state.inserted[0]).toMatchObject({
      jobOfTheDay: null,
      testThis: [{ name: 'Try', url: 'https://example.com/try' }],
    });
  });

  it('treats a lesson with no discipline as non-3D', async () => {
    state.lessonRows = [{ slug: 'l-none', disciplineSlug: null }];
    await upsertLessonMaterial(1, material);
    expect(state.inserted[0]).toMatchObject({ jobOfTheDay: null });
  });

  it('writes nothing for a lesson that does not exist', async () => {
    state.lessonRows = [];
    expect(await upsertLessonMaterial(1, material)).toBeNull();
    expect(state.inserted).toHaveLength(0);
  });
});
