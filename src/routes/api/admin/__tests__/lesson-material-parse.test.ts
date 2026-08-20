// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fully stub these — the route imports auth/permission modules that pull in
// real db/session wiring vitest can't resolve (@/ imports, side effects). `#/`
// not `@/`: vitest cannot resolve the `@/` alias, and the route imports via
// `#/`, so the mock specifiers must match exactly or the route gets the real
// module instead of the stub.
const {
  getSession,
  hasCoursePermissionAnywhere,
  wordToHtml,
  generateLessonMaterial,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasCoursePermissionAnywhere: vi.fn(),
  wordToHtml: vi.fn(),
  generateLessonMaterial: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/permissions.server', () => ({ hasCoursePermissionAnywhere }));
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

const MATERIAL = {
  text: '<p>Body</p>',
  keyPoints: [],
  proTips: '',
  quiz: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  // The default actor holds the grant, so a test that means to exercise the
  // parsing path is not silently 403'ing instead.
  hasCoursePermissionAnywhere.mockResolvedValue(true);
});

describe('parseLessonMaterialHandler', () => {
  it('returns 403 when there is no session, without calling the generator', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await parseLessonMaterialHandler(requestWith(null));
    expect(res.status).toBe(403);
    expect(hasCoursePermissionAnywhere).not.toHaveBeenCalled();
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  /**
   * Spec §9b.2: guard on holding `content:create` on ANY course, not on
   * merely being staff somewhere. This route has no identifier of any kind to
   * scope by, so the grant is the only honest bound available.
   */
  it('asks whether this user holds content:create anywhere', async () => {
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockResolvedValueOnce(MATERIAL);

    await parseLessonMaterialHandler(requestWith(file));

    expect(hasCoursePermissionAnywhere).toHaveBeenCalledWith(
      'u1',
      'content',
      'create',
    );
  });

  /**
   * A course manager holds `content:read` only, and an admin by design holds
   * no `content` grant at all. Both used to pass the old "staff anywhere" /
   * "admin" bound and burn LLM budget generating material that
   * `lessons.$lessonId.material.ts` — which requires `content:update` — would
   * then refuse to save.
   */
  it('returns 403 without generating when the grant is missing', async () => {
    hasCoursePermissionAnywhere.mockResolvedValue(false);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));

    expect(res.status).toBe(403);
    expect(wordToHtml).not.toHaveBeenCalled();
    expect(generateLessonMaterial).not.toHaveBeenCalled();
  });

  it('allows a subject expert, who holds no global role at all', async () => {
    getSession.mockResolvedValue({ user: { id: 'sme-1' } });
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockResolvedValueOnce(MATERIAL);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MATERIAL);
  });

  it('returns 400 for a non-docx file', async () => {
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      400,
    );
  });

  it('returns 400 when no file is provided', async () => {
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      400,
    );
  });

  it('converts, generates, and returns parsed material', async () => {
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockResolvedValueOnce(MATERIAL);
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MATERIAL);
    expect(generateLessonMaterial).toHaveBeenCalledWith('<p>Body</p>');
  });

  it('returns 500 when generation throws', async () => {
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockRejectedValueOnce(new Error('model down'));
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      500,
    );
  });
});
