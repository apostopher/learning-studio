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
    requirePermission: vi.fn(),
    requireCourseCreation: vi.fn(),
    getStaffScopedCourseIds: vi.fn(),
    listOfferings: vi.fn(),
    createOffering: vi.fn(),
    updateOffering: vi.fn(),
    deleteOffering: vi.fn(),
    getSession: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
  requireCourseCreation: m.requireCourseCreation,
  getStaffScopedCourseIds: m.getStaffScopedCourseIds,
}));
vi.mock('#/db/offerings', () => ({
  listOfferings: m.listOfferings,
  createOffering: m.createOffering,
  updateOffering: m.updateOffering,
  deleteOffering: m.deleteOffering,
}));
vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));

import { createOfferingHandler, listOfferingsHandler } from '../offerings';
import {
  deleteOfferingHandler,
  patchOfferingHandler,
} from '../offerings.$offeringId';

const OFFERING = {
  id: 1,
  courseId: 10,
  courseName: '2 Week',
  startsOn: '2026-09-07',
  endsOn: '2026-09-20',
  users: [],
};

const listReq = (qs = '?from=2026-09-01&to=2026-11-15') =>
  new Request(`http://t/api/admin/offerings${qs}`, { method: 'GET' });

const postReq = (body: unknown) =>
  new Request('http://t/api/admin/offerings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patchReq = (body: unknown) =>
  new Request('http://t/api/admin/offerings/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const VALID_CREATE = {
  courseId: 10,
  startsOn: '2026-09-07',
  endsOn: '2026-09-20',
  userIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  m.listOfferings.mockResolvedValue([OFFERING]);
  m.createOffering.mockResolvedValue(OFFERING);
  m.updateOffering.mockResolvedValue(OFFERING);
  m.deleteOffering.mockResolvedValue(true);
  m.getSession.mockResolvedValue({ user: { id: 'actor-1' } });
});

describe('GET /api/admin/offerings', () => {
  it('lists the whole schedule for an actor with course:read', async () => {
    m.requirePermission.mockResolvedValue(undefined);

    const res = await listOfferingsHandler(listReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([OFFERING]);
    // No course narrowing: this actor sees every course's offerings.
    expect(m.listOfferings.mock.calls[0][0]).toEqual({
      windowStart: '2026-09-01',
      windowEnd: '2026-11-15',
    });
  });

  /**
   * A subject expert holds no `course:read` — that grant is the whole
   * catalogue — but must still see the schedule for courses they work on.
   */
  it('narrows to the staffed courses when course:read is refused', async () => {
    m.requirePermission.mockRejectedValue(new m.ForbiddenError());
    m.getStaffScopedCourseIds.mockResolvedValue([10, 11]);

    const res = await listOfferingsHandler(listReq());

    expect(res.status).toBe(200);
    expect(m.listOfferings.mock.calls[0][0].courseIds).toEqual([10, 11]);
  });

  /**
   * An empty schedule would read as "nothing is scheduled" when the truth is
   * "you may not see it" — matching how the courses endpoint answers.
   */
  it('refuses an actor staffed on nothing rather than returning an empty list', async () => {
    m.requirePermission.mockRejectedValue(new m.ForbiddenError());
    m.getStaffScopedCourseIds.mockResolvedValue([]);

    const res = await listOfferingsHandler(listReq());

    expect(res.status).toBe(403);
    expect(m.listOfferings).not.toHaveBeenCalled();
  });

  /**
   * The window is required. Defaulting it would quietly return a different
   * set than the grid is drawing — a bar missing only once you scroll.
   */
  it.each([
    ['no window at all', ''],
    ['only a start', '?from=2026-09-01'],
    ['a malformed date', '?from=2026-9-1&to=2026-11-15'],
    ['an end before the start', '?from=2026-11-15&to=2026-09-01'],
  ])('rejects %s with a 400', async (_label, qs) => {
    m.requirePermission.mockResolvedValue(undefined);

    const res = await listOfferingsHandler(listReq(qs));

    expect(res.status).toBe(400);
    expect(m.listOfferings).not.toHaveBeenCalled();
  });

  /**
   * Authorization runs BEFORE the query string is validated. The other order
   * answered an unauthenticated caller with a 400 describing the parameters
   * this endpoint wants — telling someone who may not use it how to call it.
   */
  it('refuses an unauthorized caller before it complains about the window', async () => {
    m.requirePermission.mockRejectedValue(new m.ForbiddenError());
    m.getStaffScopedCourseIds.mockResolvedValue([]);

    const res = await listOfferingsHandler(listReq(''));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/offerings', () => {
  it('creates an offering for a course manager or admin', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);

    const res = await createOfferingHandler(postReq(VALID_CREATE));

    expect(res.status).toBe(201);
    expect(m.createOffering).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 10, endsOn: '2026-09-20' }),
      'actor-1',
    );
  });

  it('refuses anyone the write guard refuses, and writes nothing', async () => {
    m.requireCourseCreation.mockRejectedValue(new m.ForbiddenError());

    const res = await createOfferingHandler(postReq(VALID_CREATE));

    expect(res.status).toBe(403);
    expect(m.createOffering).not.toHaveBeenCalled();
  });

  /**
   * An offering ending before it starts draws a bar with no days in it, which
   * reads as a MISSING offering rather than a broken one.
   */
  it('rejects an end date before the start date', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);

    const res = await createOfferingHandler(
      postReq({ ...VALID_CREATE, endsOn: '2026-09-01' }),
    );

    expect(res.status).toBe(400);
    expect(m.createOffering).not.toHaveBeenCalled();
  });

  it('accepts an offering that starts and ends on the same day', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);

    const res = await createOfferingHandler(
      postReq({ ...VALID_CREATE, endsOn: VALID_CREATE.startsOn }),
    );

    expect(res.status).toBe(201);
  });

  // Attribution only — the guard has already decided this caller may write.
  it('creates an unattributed offering when there is no session', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);
    m.getSession.mockResolvedValue(null);

    const res = await createOfferingHandler(postReq(VALID_CREATE));

    expect(res.status).toBe(201);
    expect(m.createOffering.mock.calls[0][1]).toBeNull();
  });
});

describe('PATCH and DELETE /api/admin/offerings/:id', () => {
  const VALID_UPDATE = {
    startsOn: '2026-09-07',
    endsOn: '2026-09-21',
    userIds: ['u1'],
  };

  it('updates dates and roster together', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);

    const res = await patchOfferingHandler(patchReq(VALID_UPDATE), '1');

    expect(res.status).toBe(200);
    expect(m.updateOffering).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ endsOn: '2026-09-21', userIds: ['u1'] }),
      'actor-1',
    );
  });

  it('refuses a write the guard refuses', async () => {
    m.requireCourseCreation.mockRejectedValue(new m.ForbiddenError());

    const res = await patchOfferingHandler(patchReq(VALID_UPDATE), '1');

    expect(res.status).toBe(403);
    expect(m.updateOffering).not.toHaveBeenCalled();
  });

  it('answers 404 for an offering that is gone', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);
    m.updateOffering.mockResolvedValue(null);

    const res = await patchOfferingHandler(patchReq(VALID_UPDATE), '1');

    expect(res.status).toBe(404);
  });

  it.each([
    ['abc'],
    ['0'],
    ['-1'],
  ])('rejects the id %s without touching the database', async (raw) => {
    m.requireCourseCreation.mockResolvedValue(undefined);

    const res = await patchOfferingHandler(patchReq(VALID_UPDATE), raw);

    expect(res.status).toBe(400);
    expect(m.updateOffering).not.toHaveBeenCalled();
  });

  it('unschedules an offering', async () => {
    m.requireCourseCreation.mockResolvedValue(undefined);

    const res = await deleteOfferingHandler(
      new Request('http://t/api/admin/offerings/1', { method: 'DELETE' }),
      '1',
    );

    expect(res.status).toBe(204);
    expect(m.deleteOffering).toHaveBeenCalledWith(1);
  });

  it('refuses a delete the guard refuses', async () => {
    m.requireCourseCreation.mockRejectedValue(new m.ForbiddenError());

    const res = await deleteOfferingHandler(
      new Request('http://t/api/admin/offerings/1', { method: 'DELETE' }),
      '1',
    );

    expect(res.status).toBe(403);
    expect(m.deleteOffering).not.toHaveBeenCalled();
  });
});
