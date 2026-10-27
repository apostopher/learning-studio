import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DebriefStatusError,
  fetchDebriefStatus,
} from '#/data-hooks/use-debrief-status';

afterEach(() => vi.unstubAllGlobals());

const lesson = { courseSlug: 'ppl', lessonSlug: 'l1' };
const respond = (status: number, body: unknown = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );

/**
 * The panel tells a refusal (403/404) apart from a failure by the status
 * code, so the error the query surfaces must carry it.
 */
describe('fetchDebriefStatus', () => {
  it.each([
    403, 404, 500,
  ])('rejects with the HTTP status (%i)', async (code) => {
    respond(code);
    const error = await fetchDebriefStatus(lesson).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DebriefStatusError);
    expect((error as DebriefStatusError).status).toBe(code);
  });

  it('still validates a 200 with zod', async () => {
    respond(200, { state: { kind: 'nonsense' }, lessonOutstanding: [] });
    await expect(fetchDebriefStatus(lesson)).rejects.toThrow();
  });
});
