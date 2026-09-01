// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  isStaffAnywhere: vi.fn(),
  getOrgLibrary: vi.fn(),
  getOrgEditorBoard: vi.fn(),
}));
vi.mock('#/lib/permissions.server', () => ({
  isStaffAnywhere: m.isStaffAnywhere,
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
  m.isStaffAnywhere.mockResolvedValue(true);
  m.getOrgLibrary.mockResolvedValue({ disciplines: [], untitled: [] });
  m.getOrgEditorBoard.mockResolvedValue([]);
});

/**
 * Both handlers gate on `isStaffAnywhere` and NOT on `requireAdmin`.
 *
 * The whole point of the knowledge library is the discipline-scoped subject
 * expert built in Task 6r, and an admin-only floor 403s exactly that role.
 * `isStaffAnywhere` is the union that fits: admin/owner, any `course_staff`
 * row, any `discipline_staff` row — "has standing somewhere on the teaching
 * side". Course staff are in deliberately, because the editor's right-hand
 * pane is course composition, which is their work.
 *
 * This gates OPENING the screen only. Editing a lesson still needs
 * `requireLessonContentPermission` on that lesson's discipline; every
 * placement write still needs `requireCoursePermission(courseId, 'structure',
 * …)`. Neither changed.
 */
describe.each([
  [
    'GET /api/admin/library',
    () => getLibraryHandler(req()),
    () => m.getOrgLibrary,
  ],
  [
    'GET /api/admin/editor',
    () => getEditorBoardHandler(req()),
    () => m.getOrgEditorBoard,
  ],
] as const)('%s — who may open the editor', (_name, call, query) => {
  /**
   * Mutant seen RED: `requireAdmin` restored in place of `isStaffAnywhere`.
   * With `isStaffAnywhere` mocked true and `requireAdmin` unmocked the handler
   * would throw or 403; either way this fails.
   */
  it('admits a discipline-SME-only caller', async () => {
    // What `isStaffAnywhere` answers for an SME with zero course_staff rows —
    // its own derivation is covered in permissions-server.test.ts.
    m.isStaffAnywhere.mockResolvedValueOnce(true);

    const res = await call();

    expect(res.status).toBe(200);
    expect(query()).toHaveBeenCalledWith(7);
  });

  /**
   * Mutant seen RED: the guard inverted or dropped (`if (false)` / no check).
   * Asserting the DB function was never called is what makes this a real
   * refusal test — a handler that queries and then discards the rows would
   * still return 403 and would still have read the org's whole curriculum.
   */
  it('refuses an anonymous caller without touching the database', async () => {
    m.isStaffAnywhere.mockResolvedValueOnce(false);

    const res = await call();

    expect(res.status).toBe(403);
    expect(query()).not.toHaveBeenCalled();
  });

  /** The guard reads the request's own headers, not an ambient session. */
  it('passes the request headers to the guard', async () => {
    await call();

    expect(m.isStaffAnywhere).toHaveBeenCalledWith(expect.any(Headers));
  });
});

describe('GET /api/admin/library', () => {
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

  // Round-1 review (Minor 7), narrowed per round-2: the constraint from the
  // task-9 dispatch is that this route accepts NO course filter of any kind
  // — its `course_orgs` join is the only tenant-isolation boundary
  // (`getCourseBoard` performs no org check on the id it's handed). Checking
  // only the argument `getOrgEditorBoard` received would let a mutant call
  // it correctly with the active org and then filter the RESULT in JS by
  // `?courseId=99` — passing the argument assertion while still leaking a
  // course-scoped filter through the back door. So this asserts both: the
  // query resolved via the active org, AND the response carries every board
  // the query returned, including ones whose course id doesn't match the
  // query string at all.
  it('ignores a courseId query param and still resolves via the active org alone', async () => {
    const boards = [
      {
        course: {
          id: 2,
          name: 'A',
          slug: 'a',
          description: null,
          imageUrlAvif: null,
          imageUrlWebp: null,
        },
        modules: [],
      },
      {
        course: {
          id: 5,
          name: 'B',
          slug: 'b',
          description: null,
          imageUrlAvif: null,
          imageUrlWebp: null,
        },
        modules: [],
      },
    ];
    m.getOrgEditorBoard.mockResolvedValueOnce(boards);
    const withQuery = new Request('http://test/api/admin/editor?courseId=99');
    const res = await getEditorBoardHandler(withQuery);
    expect(m.getOrgEditorBoard).toHaveBeenCalledWith(7);
    expect(m.getOrgEditorBoard).not.toHaveBeenCalledWith(99);
    expect(await res.json()).toEqual(boards);
  });
});
