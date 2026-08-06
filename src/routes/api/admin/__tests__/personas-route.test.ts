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
    listPersonas: vi.fn(),
    listPersonaUsage: vi.fn(),
    createPersona: vi.fn(),
    renamePersona: vi.fn(),
    deletePersona: vi.fn(),
    savePersonaDraft: vi.fn(),
    discardPersonaDraft: vi.fn(),
    publishPersona: vi.fn(),
    setOrgDefaultPersona: vi.fn(),
    getCoursePersonaSelection: vi.fn(),
    setCoursePersona: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/persona', () => ({
  listPersonas: m.listPersonas,
  listPersonaUsage: m.listPersonaUsage,
  createPersona: m.createPersona,
  renamePersona: m.renamePersona,
  deletePersona: m.deletePersona,
  savePersonaDraft: m.savePersonaDraft,
  discardPersonaDraft: m.discardPersonaDraft,
  publishPersona: m.publishPersona,
  setOrgDefaultPersona: m.setOrgDefaultPersona,
}));
vi.mock('#/db/course-orgs', () => ({
  getCoursePersonaSelection: m.getCoursePersonaSelection,
  setCoursePersona: m.setCoursePersona,
}));
// The active org is deployment configuration, not session state — pinned here
// so every handler's org argument is assertable.
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 1 }));

import { putCoursePersonaHandler } from '../courses.$courseId.persona';
import { getPersonasHandler, postPersonaHandler } from '../personas';
import {
  deletePersonaHandler,
  patchPersonaHandler,
} from '../personas.$personaId';
import { putPersonaDefaultHandler } from '../personas.$personaId.default';
import { postPersonaDraftHandler } from '../personas.$personaId.draft';
import { postPersonaPublishHandler } from '../personas.$personaId.publish';

const PERSONA = {
  id: 3,
  name: 'Viper7',
  content: {
    basicInfo: 'a',
    mission: '',
    goal: '',
    communicationStyle: '',
    quotes: [],
    coreDirective: '',
    howToAnswer: '',
  },
  draftContent: null,
  isPublished: true,
  isOrgDefault: false,
  updatedAt: new Date('2026-08-06T00:00:00Z'),
};

function req(body?: unknown, method = 'POST'): Request {
  return new Request('http://t/x', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
  m.listPersonas.mockResolvedValue([PERSONA]);
  m.listPersonaUsage.mockResolvedValue({});
});

describe('persona routes — admin guard', () => {
  // Every handler is its own entry point, so each one must self-guard: a
  // single unguarded route is a full bypass of the others.
  const cases: [string, () => Promise<Response>][] = [
    ['GET /personas', () => getPersonasHandler(req(undefined, 'GET'))],
    ['POST /personas', () => postPersonaHandler(req({ name: 'x' }))],
    ['PATCH /personas/:id', () => patchPersonaHandler(req({ name: 'x' }), '3')],
    ['DELETE /personas/:id', () => deletePersonaHandler(req(undefined), '3')],
    ['POST /personas/:id/draft', () => postPersonaDraftHandler(req({}), '3')],
    [
      'POST /personas/:id/publish',
      () => postPersonaPublishHandler(req(undefined), '3'),
    ],
    [
      'PUT /personas/:id/default',
      () => putPersonaDefaultHandler(req(undefined), '3'),
    ],
    [
      'PUT /courses/:id/persona',
      () => putCoursePersonaHandler(req({ personaId: 3 }), '2'),
    ],
  ];

  it.each(cases)('%s returns 403 for a non-admin', async (_label, call) => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await call();
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/personas', () => {
  it('scopes the list to the active org', async () => {
    await getPersonasHandler(req(undefined, 'GET'));
    expect(m.listPersonas).toHaveBeenCalledWith(1);
    expect(m.listPersonaUsage).toHaveBeenCalledWith(1);
  });

  it('attaches the courses using each persona', async () => {
    m.listPersonaUsage.mockResolvedValueOnce({ 3: ['ITPS UAS Remote'] });
    const res = await getPersonasHandler(req(undefined, 'GET'));
    const body = await res.json();
    expect(body[0].usedByCourses).toEqual(['ITPS UAS Remote']);
  });

  it('reports an unused persona as an empty list, not a missing key', async () => {
    const res = await getPersonasHandler(req(undefined, 'GET'));
    const body = await res.json();
    expect(body[0].usedByCourses).toEqual([]);
  });
});

describe('POST /api/admin/personas', () => {
  it('creates in the active org', async () => {
    m.createPersona.mockResolvedValueOnce({ ok: true, persona: PERSONA });
    const res = await postPersonaHandler(req({ name: 'Viper7' }));
    expect(m.createPersona).toHaveBeenCalledWith(1, 'Viper7');
    expect(res.status).toBe(201);
  });

  it('rejects a blank name', async () => {
    const res = await postPersonaHandler(req({ name: '  ' }));
    expect(res.status).toBe(400);
    expect(m.createPersona).not.toHaveBeenCalled();
  });

  it('409s a duplicate name with the field, so the input can own the error', async () => {
    m.createPersona.mockResolvedValueOnce({
      ok: false,
      reason: 'duplicate-name',
    });
    const res = await postPersonaHandler(req({ name: 'Viper7' }));
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
  });
});

describe('PATCH /api/admin/personas/:id', () => {
  it('409s a name that collides within the org', async () => {
    m.renamePersona.mockResolvedValueOnce({
      ok: false,
      reason: 'duplicate-name',
    });
    const res = await patchPersonaHandler(req({ name: 'Viper7' }), '3');
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
  });

  it('404s an id from another org', async () => {
    m.renamePersona.mockResolvedValueOnce({ ok: false, reason: 'not-found' });
    const res = await patchPersonaHandler(req({ name: 'x' }), '3');
    expect(res.status).toBe(404);
  });

  it('rejects a non-numeric id before touching the database', async () => {
    const res = await patchPersonaHandler(req({ name: 'x' }), 'abc');
    expect(res.status).toBe(400);
    expect(m.renamePersona).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/personas/:id/draft', () => {
  // The one route sendBeacon can reach. It must stay POST-shaped and accept a
  // plain JSON body, because a beacon cannot set headers or use PATCH.
  it('writes the posted content as a draft, scoped to the active org', async () => {
    m.savePersonaDraft.mockResolvedValueOnce(PERSONA);
    const draft = { basicInfo: 'typed', quotes: ['q'] };
    const res = await postPersonaDraftHandler(req(draft), '3');
    expect(res.status).toBe(200);
    expect(m.savePersonaDraft).toHaveBeenCalledWith(
      1,
      3,
      expect.objectContaining({ basicInfo: 'typed', quotes: ['q'] }),
    );
  });

  it('fills omitted fields with blanks rather than rejecting a partial save', async () => {
    m.savePersonaDraft.mockResolvedValueOnce(PERSONA);
    await postPersonaDraftHandler(req({ basicInfo: 'only this' }), '3');
    expect(m.savePersonaDraft).toHaveBeenCalledWith(1, 3, {
      basicInfo: 'only this',
      mission: '',
      goal: '',
      communicationStyle: '',
      quotes: [],
      coreDirective: '',
      howToAnswer: '',
    });
  });

  it('404s a persona outside the active org', async () => {
    m.savePersonaDraft.mockResolvedValueOnce(null);
    const res = await postPersonaDraftHandler(req({}), '3');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/personas/:id/default', () => {
  it('refuses an unpublished persona and says why', async () => {
    m.setOrgDefaultPersona.mockResolvedValueOnce({
      ok: false,
      reason: 'unpublished',
    });
    const res = await putPersonaDefaultHandler(req(undefined), '3');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/publish/i);
  });

  it('sets the default in the active org', async () => {
    m.setOrgDefaultPersona.mockResolvedValueOnce({ ok: true });
    const res = await putPersonaDefaultHandler(req(undefined), '3');
    expect(m.setOrgDefaultPersona).toHaveBeenCalledWith(1, 3);
    expect(res.status).toBe(204);
  });
});

describe('PUT /api/admin/courses/:id/persona', () => {
  it('pins the course to the persona for the active org', async () => {
    m.setCoursePersona.mockResolvedValueOnce({ ok: true });
    const res = await putCoursePersonaHandler(req({ personaId: 3 }), '2');
    expect(m.setCoursePersona).toHaveBeenCalledWith(2, 1, 3);
    expect(res.status).toBe(204);
  });

  it('accepts null to clear the override and follow the org default', async () => {
    m.setCoursePersona.mockResolvedValueOnce({ ok: true });
    const res = await putCoursePersonaHandler(req({ personaId: null }), '2');
    expect(m.setCoursePersona).toHaveBeenCalledWith(2, 1, null);
    expect(res.status).toBe(204);
  });

  it('refuses an unpublished persona and says why', async () => {
    m.setCoursePersona.mockResolvedValueOnce({
      ok: false,
      reason: 'unpublished',
    });
    const res = await putCoursePersonaHandler(req({ personaId: 3 }), '2');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/publish/i);
  });

  it('404s when the course is not in the active org', async () => {
    m.setCoursePersona.mockResolvedValueOnce({
      ok: false,
      reason: 'not-linked',
    });
    const res = await putCoursePersonaHandler(req({ personaId: 3 }), '2');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/organisation/i);
  });
});

describe('POST /api/admin/personas/:id/publish', () => {
  it('publishes within the active org', async () => {
    m.publishPersona.mockResolvedValueOnce(PERSONA);
    const res = await postPersonaPublishHandler(req(undefined), '3');
    expect(m.publishPersona).toHaveBeenCalledWith(1, 3);
    expect(res.status).toBe(200);
  });

  it('404s a persona outside the active org', async () => {
    m.publishPersona.mockResolvedValueOnce(null);
    const res = await postPersonaPublishHandler(req(undefined), '3');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/personas/:id', () => {
  it('deletes within the active org', async () => {
    m.deletePersona.mockResolvedValueOnce(true);
    const res = await deletePersonaHandler(req(undefined), '3');
    expect(m.deletePersona).toHaveBeenCalledWith(1, 3);
    expect(res.status).toBe(204);
  });

  it('404s an id from another org', async () => {
    m.deletePersona.mockResolvedValueOnce(false);
    const res = await deletePersonaHandler(req(undefined), '3');
    expect(res.status).toBe(404);
  });
});
