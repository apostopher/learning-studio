// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Fully stub admin-functions.server — importOriginal would load the real module
// (which uses @/ imports vitest can't resolve, plus auth/db side effects). The
// route imports ForbiddenError from this same mocked path, so the stub class is
// the one `instanceof` checks against. vi.hoisted defines these before the
// hoisted vi.mock factories run.
const { requireAdmin, ForbiddenError, wordToHtml, generateLessonMaterial } =
  vi.hoisted(() => {
    class ForbiddenError extends Error {
      constructor() {
        super('Forbidden');
        this.name = 'ForbiddenError';
      }
    }
    return {
      requireAdmin: vi.fn(),
      ForbiddenError,
      wordToHtml: vi.fn(),
      generateLessonMaterial: vi.fn(),
    };
  });
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin,
  ForbiddenError,
}));
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

describe('parseLessonMaterialHandler', () => {
  it('returns 403 for a non-admin', async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      403,
    );
  });

  it('returns 400 for a non-docx file', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u1', roles: ['admin'] });
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      400,
    );
  });

  it('returns 400 when no file is provided', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u1', roles: ['admin'] });
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      400,
    );
  });

  it('converts, generates, and returns parsed material', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u1', roles: ['admin'] });
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
    requireAdmin.mockResolvedValueOnce({ userId: 'u1', roles: ['admin'] });
    wordToHtml.mockResolvedValueOnce('<p>Body</p>');
    generateLessonMaterial.mockRejectedValueOnce(new Error('model down'));
    const file = new File(['bytes'], 'lesson.docx', { type: DOCX_MIME });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      500,
    );
  });
});
