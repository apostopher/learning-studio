// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fully stubbed, never `importOriginal` (see vitest-alias memory): the
 * builder's SQL is pinned by its `where` fragments rendered through
 * `renderSql`, and the poster fetch is a spy — what this file proves is
 * WHICH lessons are asked for and WHOSE credentials are borrowed.
 */
const db = vi.hoisted(() => ({ select: vi.fn() }));
const posters = vi.hoisted(() => ({ buildLessonPosters: vi.fn() }));
const crypto = vi.hoisted(() => ({ decryptJson: vi.fn((v: unknown) => v) }));

function makeChain(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable, mirroring drizzle builders
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock('#/db', () => ({ db }));
vi.mock('#/lib/video-providers/posters.server', () => posters);
vi.mock('#/lib/crypto.server', () => crypto);

const { getDisciplineLessonPosters, resolveOrgProvider } = await import(
  '#/db/library-posters'
);

beforeEach(() => {
  vi.clearAllMocks();
  posters.buildLessonPosters.mockResolvedValue({ 1: 'https://p/1.jpg' });
});

describe('resolveOrgProvider', () => {
  it("answers the first course in the org that has that provider connected, with the course's id for the cache key", async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ courseId: 6, secrets: { apiKey: 'k' } }]),
    );
    await expect(resolveOrgProvider(1, 'synthesia')).resolves.toEqual({
      courseId: 6,
      creds: { apiKey: 'k' },
    });
  });

  it('answers null when no course in the org has it', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    await expect(resolveOrgProvider(1, 'mux')).resolves.toBeNull();
  });
});

describe('getDisciplineLessonPosters', () => {
  it('asks for posters for every lesson of the discipline that has a video, borrowing the lending course for the cache key', async () => {
    db.select
      .mockReturnValueOnce(
        makeChain([
          { id: 1, provider: 'synthesia', ref: 'a' },
          { id: 2, provider: 'mux', ref: 'b' },
        ]),
      ) // lessons in discipline 4
      .mockReturnValueOnce(
        makeChain([{ courseId: 6, secrets: { apiKey: 'k' } }]),
      ); // synthesia lender

    const out = await getDisciplineLessonPosters(1, 4);

    expect(out).toEqual({ 1: 'https://p/1.jpg' });
    const call = posters.buildLessonPosters.mock.calls[0][0];
    expect(call.courseId).toBe(6);
    expect(call.lessons).toEqual([
      { id: 1, provider: 'synthesia', ref: 'a' },
      { id: 2, provider: 'mux', ref: 'b' },
    ]);
  });

  it('answers {} without a provider sweep when the discipline has no lessons with video', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    await expect(getDisciplineLessonPosters(1, 4)).resolves.toEqual({});
    expect(posters.buildLessonPosters).not.toHaveBeenCalled();
  });

  it('serves the org bag (disciplineId null) the same way', async () => {
    db.select
      .mockReturnValueOnce(
        makeChain([{ id: 9, provider: 'synthesia', ref: 'z' }]),
      )
      .mockReturnValueOnce(makeChain([]));
    await getDisciplineLessonPosters(1, null);
    const call = posters.buildLessonPosters.mock.calls[0][0];
    expect(call.lessons).toEqual([{ id: 9, provider: 'synthesia', ref: 'z' }]);
    // No lender: the cache key falls to 0 and the loader answers null, so
    // the sweep is skipped inside the builder.
    expect(call.courseId).toBe(0);
    await expect(call.loadCredentials('synthesia')).resolves.toBeNull();
  });
});
