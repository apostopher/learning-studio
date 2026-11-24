// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    getLessonAlternateVideos: vi.fn(),
    setLessonAlternateVideo: vi.fn(),
    removeLessonAlternateVideo: vi.fn(),
    requestLessonCaptionsSafely: vi.fn(async (_input: unknown) => {}),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getDisciplineIdForLessonId: m.getDisciplineIdForLessonId,
}));
// The real gate module, for its error class; only its database is stubbed.
vi.mock('#/db', () => ({ db: {} }));
vi.mock('#/db/lesson-versions', () => ({
  countCoursesOnVersion: vi.fn(),
  highestTakenVersions: vi.fn(),
}));
vi.mock('#/db/admin', () => ({
  getLessonAlternateVideos: m.getLessonAlternateVideos,
  setLessonAlternateVideo: m.setLessonAlternateVideo,
  removeLessonAlternateVideo: m.removeLessonAlternateVideo,
}));
vi.mock('#/db/video-captions', () => ({
  requestLessonCaptionsSafely: m.requestLessonCaptionsSafely,
}));

import { VersionEditError } from '#/db/lesson-content-edit';
import { versionConflictSchema } from '#/lib/admin-schemas';
import {
  deleteAlternateVideoHandler,
  getAlternateVideosHandler,
  putAlternateVideoHandler,
} from '../lessons.$lessonId.alternate-videos';

const conflict = {
  error: 'v1.0 is used by 1 course. Enter a higher version to make changes.',
  code: 'version' as const,
  version: '1.0',
  highestTaken: '1.0',
};
async function expectConflict(res: Response) {
  expect(res.status).toBe(409);
  expect(versionConflictSchema.parse(await res.json())).toEqual(conflict);
}

const json = (method: string, body: unknown) =>
  new Request('http://test/api/admin/lessons/10/alternate-videos', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const entry = { lang: 'fr-CA', provider: 'synthesia', ref: 'e9eecce0' };

beforeEach(() => {
  vi.resetAllMocks();
  m.getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 7,
  });
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
  m.getLessonAlternateVideos.mockResolvedValue([entry]);
  m.setLessonAlternateVideo.mockResolvedValue({ id: 10 });
  m.removeLessonAlternateVideo.mockResolvedValue({ id: 10 });
});

describe('GET', () => {
  it("lists the alternates under content:read on the lesson's discipline", async () => {
    const res = await getAlternateVideosHandler(
      new Request('http://test/x'),
      '10',
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([entry]);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'read',
    );
  });
});

describe('PUT', () => {
  it('upserts a valid entry under content:update', async () => {
    const res = await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(res.status).toBe(200);
    expect(m.setLessonAlternateVideo).toHaveBeenCalledWith(
      10,
      entry,
      undefined,
    );
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'update',
    );
  });

  it('400s an unknown lang or provider without writing', async () => {
    const res = await putAlternateVideoHandler(
      json('PUT', { ...entry, lang: 'FR' }),
      '10',
    );
    expect(res.status).toBe(400);
    expect(m.setLessonAlternateVideo).not.toHaveBeenCalled();
  });

  it('403s without permission', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(res.status).toBe(403);
    expect(m.setLessonAlternateVideo).not.toHaveBeenCalled();
  });
});

describe.each([
  {
    method: 'PUT',
    handler: putAlternateVideoHandler,
    writer: m.setLessonAlternateVideo,
    body: entry,
    written: entry,
  },
  {
    method: 'DELETE',
    handler: deleteAlternateVideoHandler,
    writer: m.removeLessonAlternateVideo,
    body: { lang: 'fr-CA' },
    written: 'fr-CA',
  },
])('$method version', ({ method, handler, writer, body, written }) => {
  it('version reaches the writer, and not the stored entry', async () => {
    const res = await handler(
      json(method, { ...body, version: ' 1.1 ' }),
      '10',
    );
    expect(res.status).toBe(200);
    expect(writer.mock.calls).toEqual([[10, written, '1.1']]);
  });

  it('400s a malformed version without writing', async () => {
    const res = await handler(json(method, { ...body, version: '01.1' }), '10');
    expect(res.status).toBe(400);
    expect(writer).not.toHaveBeenCalled();
  });

  it('409 body parses as versionConflictSchema; no captions are requested', async () => {
    writer.mockRejectedValueOnce(new VersionEditError(conflict));
    // Mux, which asks for captions when it saves.
    await expectConflict(
      await handler(json(method, { ...body, provider: 'mux' }), '10'),
    );
    expect(m.requestLessonCaptionsSafely).not.toHaveBeenCalled();
  });

  it('a refused caller gets the 403 and nothing is written', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await handler(json(method, { ...body, version: '1.1' }), '10');
    expect(res.status).toBe(403);
    expect(writer).not.toHaveBeenCalled();
  });
});

describe('PUT captions trigger', () => {
  it('a Mux alternate save requests captions in that language', async () => {
    const res = await putAlternateVideoHandler(
      json('PUT', { lang: 'fr', provider: 'mux', ref: 'altpid' }),
      '10',
    );
    expect(res.status).toBe(200);
    expect(m.requestLessonCaptionsSafely).toHaveBeenCalledWith({
      lessonId: 10,
      playbackId: 'altpid',
      lang: 'fr',
    });
  });

  it('a Synthesia alternate requests no Mux captions', async () => {
    await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(m.requestLessonCaptionsSafely).not.toHaveBeenCalled();
  });

  it('a captions failure never fails the save', async () => {
    m.requestLessonCaptionsSafely.mockRejectedValueOnce(new Error('boom'));
    const res = await putAlternateVideoHandler(
      json('PUT', { lang: 'fr', provider: 'mux', ref: 'altpid' }),
      '10',
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE', () => {
  it('removes by lang', async () => {
    const res = await deleteAlternateVideoHandler(
      json('DELETE', { lang: 'fr-CA' }),
      '10',
    );
    expect(res.status).toBe(200);
    expect(m.removeLessonAlternateVideo).toHaveBeenCalledWith(
      10,
      'fr-CA',
      undefined,
    );
  });

  it('404s an unknown lesson', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValueOnce({ found: false });
    const res = await deleteAlternateVideoHandler(
      json('DELETE', { lang: 'fr-CA' }),
      '10',
    );
    expect(res.status).toBe(404);
  });
});
