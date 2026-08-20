// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fully stub these — the route imports auth/db modules that pull in real
// db/session wiring vitest can't resolve (@/ imports, side effects). `#/` not
// `@/`: vitest cannot resolve the `@/` alias, and the route imports via `#/`,
// so the mock specifiers must match exactly or the route gets the real
// module instead of the stub. `hasAdminAccess` is left real (imported from
// the actual `#/lib/admin-schemas`) since it's pure role-name logic with no
// side effects — mocking it would just re-implement it.
const {
  getSession,
  getUserRoleNames,
  isAnyCourseStaff,
  wordToHtml,
  generateLessonMaterial,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserRoleNames: vi.fn(),
  isAnyCourseStaff: vi.fn(),
  wordToHtml: vi.fn(),
  generateLessonMaterial: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames }));
vi.mock('#/db/course-staff', () => ({ isAnyCourseStaff }));
vi.mock('#/lib/word-to-html.server', () => ({ wordToHtml }));
vi.mock('#/ai/generate-lesson-material', () => ({ generateLessonMaterial }));

import { parseLessonMaterialHandler } from '../lesson-material.parse';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function requestWith(file: File | null): Request {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request('http://test/api/admin/lesson-material/parse', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isAnyCourseStaff.mockResolvedValue(false);
});

describe('parseLessonMaterialHandler', () => {
  it('returns 403 when there is no session, without calling the generator', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await parseLessonMaterialHandler(requestWith(null));
    expect(res.status).toBe(403);
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in user who is neither admin nor course staff, without calling the generator', async () => {
    getSession.mockResolvedValueOnce({ user: { id: 'u1' } });
    getUserRoleNames.mockResolvedValueOnce(['learner']);
    isAnyCourseStaff.mockResolvedValueOnce(false);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));

    expect(res.status).toBe(403);
    expect(isAnyCourseStaff).toHaveBeenCalledWith('u1');
    expect(wordToHtml).not.toHaveBeenCalled();
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  it('allows a course-staff user who holds no admin role', async () => {
    getSession.mockResolvedValueOnce({ user: { id: 'u2' } });
    getUserRoleNames.mockResolvedValueOnce(['subject-expert']);
    isAnyCourseStaff.mockResolvedValueOnce(true);
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    const material = {
      text: '<p>Body</p>',
      keyPoints: [],
      proTips: '',
      quiz: [],
    };
    generateLessonMaterial.mockResolvedValueOnce(material);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(material);
  });

  it('returns 400 for a non-docx file', async () => {
    getSession.mockResolvedValueOnce({ user: { id: 'u1' } });
    getUserRoleNames.mockResolvedValueOnce(['admin']);
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      400,
    );
  });

  it('returns 400 when no file is provided', async () => {
    getSession.mockResolvedValueOnce({ user: { id: 'u1' } });
    getUserRoleNames.mockResolvedValueOnce(['admin']);
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      400,
    );
  });

  it('converts, generates, and returns parsed material for an admin', async () => {
    getSession.mockResolvedValueOnce({ user: { id: 'u1' } });
    getUserRoleNames.mockResolvedValueOnce(['admin']);
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    const material = {
      text: '<p>Body</p>',
      keyPoints: [],
      proTips: '',
      quiz: [],
    };
    generateLessonMaterial.mockResolvedValueOnce(material);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(material);
    expect(generateLessonMaterial).toHaveBeenCalledWith('<p>Body</p>');
  });

  it('returns 500 when generation throws', async () => {
    getSession.mockResolvedValueOnce({ user: { id: 'u1' } });
    getUserRoleNames.mockResolvedValueOnce(['admin']);
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockRejectedValueOnce(new Error('model down'));
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      500,
    );
  });
});
