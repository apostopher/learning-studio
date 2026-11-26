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
    getLessonVersionNotes: vi.fn(),
    setLessonVersionNotes: vi.fn(),
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
vi.mock('#/db/lesson-version-notes', () => ({
  getLessonVersionNotes: m.getLessonVersionNotes,
  setLessonVersionNotes: m.setLessonVersionNotes,
}));

import {
  getVersionNotesHandler,
  putVersionNotesHandler,
} from '../lessons.$lessonId.version-notes';

const get = (query: string) =>
  getVersionNotesHandler(
    new Request(`http://test/api/admin/lessons/10/version-notes${query}`),
    '10',
  );
const put = (body: unknown) =>
  putVersionNotesHandler(
    new Request('http://test/api/admin/lessons/10/version-notes', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    '10',
  );

beforeEach(() => {
  vi.resetAllMocks();
  // A discipline id no other number here uses, so a guard on the wrong value
  // fails loudly.
  m.getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 404,
  });
  m.getLessonVersionNotes.mockResolvedValue('Saved notes');
  m.absentResourceResponse.mockResolvedValue(
    new Response('Not found', { status: 404 }),
  );
});

describe('GET version notes', () => {
  it("reads the named version's notes behind the discipline's content:read", async () => {
    const res = await get('?version=1.1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: 'Saved notes' });
    expect(m.getLessonVersionNotes).toHaveBeenCalledWith(10, '1.1');
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.any(Headers),
      404,
      'read',
    );
  });

  it('refuses a missing or malformed version without reading', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?version=one')).status).toBe(400);
    expect(m.getLessonVersionNotes).not.toHaveBeenCalled();
  });

  it('403s, reading nothing, without the permission', async () => {
    m.requireLessonContentPermission.mockRejectedValue(new m.ForbiddenError());
    expect((await get('?version=1.0')).status).toBe(403);
    expect(m.getLessonVersionNotes).not.toHaveBeenCalled();
  });
});

describe('PUT version notes', () => {
  it('writes the notes for the version sent, behind content:update', async () => {
    const res = await put({ version: '1.1', notes: 'New quiz' });
    expect(res.status).toBe(200);
    expect(m.setLessonVersionNotes).toHaveBeenCalledWith(10, '1.1', 'New quiz');
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.any(Headers),
      404,
      'update',
    );
  });

  it('refuses a malformed version, extra fields, or overlong notes, writing nothing', async () => {
    expect((await put({ version: 'x', notes: 'n' })).status).toBe(400);
    expect(
      (await put({ version: '1.0', notes: 'n', lessonId: 9 })).status,
    ).toBe(400);
    expect(
      (await put({ version: '1.0', notes: 'n'.repeat(4001) })).status,
    ).toBe(400);
    expect(m.setLessonVersionNotes).not.toHaveBeenCalled();
  });

  it('403s, writing nothing, without the permission', async () => {
    m.requireLessonContentPermission.mockRejectedValue(new m.ForbiddenError());
    expect((await put({ version: '1.0', notes: 'n' })).status).toBe(403);
    expect(m.setLessonVersionNotes).not.toHaveBeenCalled();
  });

  it('404s for a lesson that does not exist', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValue({ found: false });
    expect((await put({ version: '1.0', notes: 'n' })).status).toBe(404);
    expect(m.setLessonVersionNotes).not.toHaveBeenCalled();
  });
});
