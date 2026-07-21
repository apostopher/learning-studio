// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Fully stub admin-functions.server — importOriginal would load the real module
// (which uses @/ imports vitest can't resolve, plus auth/db side effects). This
// route only imports requireAdmin/ForbiddenError for the token-generation guard,
// which uploadPolicyFor (the code under test here) never calls.
vi.mock('#/lib/admin-functions.server', () => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return { requireAdmin: vi.fn(), ForbiddenError };
});

import { uploadPolicyFor } from '#/routes/api/admin/uploads';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('uploadPolicyFor', () => {
  it('allows pdf/docx at 50MB for training-docs keys', () => {
    const p = uploadPolicyFor('training-docs/abc.pdf');
    expect(p.allowedContentTypes).toEqual(['application/pdf', DOCX]);
    expect(p.maximumSizeInBytes).toBe(50 * 1024 * 1024);
  });

  it('keeps image-only 8MB policy for other keys', () => {
    const p = uploadPolicyFor('courses/xyz.avif');
    expect(p.allowedContentTypes).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ]);
    expect(p.maximumSizeInBytes).toBe(8 * 1024 * 1024);
  });
});
