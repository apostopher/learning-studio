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
    requireAdmin: vi.fn(),
    getOrgLibrary: vi.fn(),
    getOrgEditorBoard: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/editor', () => ({
  getOrgLibrary: m.getOrgLibrary,
  getOrgEditorBoard: m.getOrgEditorBoard,
}));
// The active org is deployment configuration, not session state — pinned here
// so every handler's org argument is assertable, matching personas-route.test.ts.
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 7 }));

import { getEditorBoardHandler } from '../editor';
import { getLibraryHandler } from '../library';

function req(): Request {
  return new Request('http://test/api/admin/library');
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
  m.getOrgLibrary.mockResolvedValue({ disciplines: [], untitled: [] });
  m.getOrgEditorBoard.mockResolvedValue([]);
});

describe('GET /api/admin/library', () => {
  it('self-guards with requireAdmin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getLibraryHandler(req());
    expect(res.status).toBe(403);
    expect(m.getOrgLibrary).not.toHaveBeenCalled();
  });

  it('resolves the active org and passes it through to getOrgLibrary', async () => {
    await getLibraryHandler(req());
    expect(m.getOrgLibrary).toHaveBeenCalledWith(7);
  });

  it('returns the library the query gives back', async () => {
    const library = {
      disciplines: [{ id: 1, name: 'UAS', slug: 'uas', lessons: [] }],
      untitled: [],
    };
    m.getOrgLibrary.mockResolvedValueOnce(library);
    const res = await getLibraryHandler(req());
    expect(await res.json()).toEqual(library);
  });
});

describe('GET /api/admin/editor', () => {
  it('self-guards with requireAdmin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getEditorBoardHandler(req());
    expect(res.status).toBe(403);
    expect(m.getOrgEditorBoard).not.toHaveBeenCalled();
  });

  it('resolves the active org and passes it through to getOrgEditorBoard', async () => {
    await getEditorBoardHandler(req());
    expect(m.getOrgEditorBoard).toHaveBeenCalledWith(7);
  });

  it('returns the boards the query gives back', async () => {
    const boards = [
      {
        course: {
          id: 2,
          name: 'C',
          slug: 'c',
          description: null,
          imageUrlAvif: null,
          imageUrlWebp: null,
        },
        modules: [],
      },
    ];
    m.getOrgEditorBoard.mockResolvedValueOnce(boards);
    const res = await getEditorBoardHandler(req());
    expect(await res.json()).toEqual(boards);
  });
});
