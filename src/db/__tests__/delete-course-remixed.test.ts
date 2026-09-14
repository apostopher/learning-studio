// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
    deletes: 0,
    /** When set, the next DELETE rejects with this error instead of resolving. */
    failNextDelete: null as Error | null,
  };
  function chain(isDelete = false) {
    // biome-ignore lint/suspicious/noExplicitAny: builder stand-in
    const c: any = {};
    for (const name of [
      'select',
      'from',
      'where',
      'returning',
      'leftJoin',
      'innerJoin',
      'limit',
    ]) {
      c[name] = () => c;
    }
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable
    c.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      if (isDelete) {
        state.deletes += 1;
        if (state.failNextDelete) {
          const error = state.failNextDelete;
          state.failNextDelete = null;
          return Promise.reject(error).then(resolve, reject);
        }
      }
      return Promise.resolve(state.results.shift() ?? []).then(resolve, reject);
    };
    return c;
  }
  return { state, db: { select: () => chain(), delete: () => chain(true) } };
});
vi.mock('#/db', () => ({ db: fake.db }));
const remixes = vi.hoisted(() => ({
  getRemixerCourseIds: vi.fn(async () => [] as number[]),
  countRemixers: vi.fn(async () => 0),
}));
vi.mock('#/db/course-remixes', () => remixes);
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/lesson-access', () => ({
  getCourseIdForModuleId: vi.fn(),
  getCourseSlugForCourseId: vi.fn(),
  getCourseSlugsForModuleId: vi.fn(),
  getCourseSlugsForLessonId: vi.fn(),
  lessonBelongsToCourseOrg: vi.fn(),
}));
vi.mock('#/db/course-orgs', () => ({ linkCourseToOrg: vi.fn() }));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));

const { deleteCourse } = await import('../admin');

beforeEach(() => {
  vi.clearAllMocks();
  fake.state.results.length = 0;
  fake.state.deletes = 0;
  fake.state.failNextDelete = null;
});

describe('deleteCourse while remixed', () => {
  it('refuses with the remixer count and issues no DELETE', async () => {
    remixes.countRemixers.mockResolvedValue(2);
    fake.state.results.push([
      { slug: 'src', imageUrlAvif: null, imageUrlWebp: null },
    ]);
    const result = await deleteCourse(6);
    expect(result).toEqual({ ok: false, reason: 'remixed', remixerCount: 2 });
    expect(fake.state.deletes).toBe(0);
  });

  it('deletes when nothing remixes it', async () => {
    remixes.countRemixers.mockResolvedValue(0);
    fake.state.results.push([
      { slug: 'src', imageUrlAvif: null, imageUrlWebp: null },
    ]);
    fake.state.results.push([]); // module images
    fake.state.results.push([{ id: 6 }]); // delete returning
    const result = await deleteCourse(6);
    expect(result).toEqual({ ok: true });
    expect(fake.state.deletes).toBe(1);
  });

  it('reads as not-found when the delete matches nothing', async () => {
    remixes.countRemixers.mockResolvedValue(0);
    fake.state.results.push([]); // no course row
    fake.state.results.push([]); // module images
    fake.state.results.push([]); // delete returning nothing
    expect(await deleteCourse(404)).toEqual({ ok: false, reason: 'not-found' });
  });

  /**
   * The RESTRICT constraint is the backstop for a race: a remix written
   * between the count and the delete. Postgres raises 23503; the caller gets
   * the same friendly refusal, recounted.
   */
  it('turns a foreign-key violation on the delete into the same refusal', async () => {
    remixes.countRemixers.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    fake.state.results.push([
      { slug: 'src', imageUrlAvif: null, imageUrlWebp: null },
    ]);
    fake.state.results.push([]);
    fake.state.failNextDelete = Object.assign(new Error('fk'), {
      code: '23503',
    });
    const result = await deleteCourse(6);
    expect(result).toEqual({ ok: false, reason: 'remixed', remixerCount: 1 });
  });
});
