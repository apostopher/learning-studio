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
    isStaffAnywhere: vi.fn(),
  };
});

// Fully stub admin-functions.server — importOriginal would load the real module
// (which uses @/ imports vitest can't resolve, plus auth/db side effects). Same
// for permissions.server, which pulls in `auth` and the drizzle client.
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  isStaffAnywhere: m.isStaffAnywhere,
}));

import {
  requireUploadAccess,
  uploadPolicyFor,
} from '#/routes/api/admin/uploads';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const HEADERS = new Headers();

beforeEach(() => {
  vi.resetAllMocks();
  m.requireAdmin.mockResolvedValue({ userId: 'a1' });
  m.isStaffAnywhere.mockResolvedValue(true);
});

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

describe('requireUploadAccess', () => {
  it('keeps the RAG corpus admin-only', async () => {
    await requireUploadAccess(HEADERS, 'training-docs/abc.pdf');
    expect(m.requireAdmin).toHaveBeenCalledWith(HEADERS);
    // The looser staff bound must not be consulted for this prefix at all —
    // an SME holding a course_staff row is not thereby an org AI admin.
    expect(m.isStaffAnywhere).not.toHaveBeenCalled();
  });

  it('refuses a training-docs key for a non-admin', async () => {
    m.requireAdmin.mockRejectedValue(new m.ForbiddenError());
    await expect(
      requireUploadAccess(HEADERS, 'training-docs/abc.pdf'),
    ).rejects.toBeInstanceOf(m.ForbiddenError);
  });

  it('lets course staff mint a token for an image key', async () => {
    // The cover image on a module dialog: `requireAdmin` would have refused
    // this, which is what broke authoring at its first step.
    await expect(
      requireUploadAccess(HEADERS, 'courses/xyz.avif'),
    ).resolves.toBeUndefined();
    expect(m.isStaffAnywhere).toHaveBeenCalledWith(HEADERS);
    expect(m.requireAdmin).not.toHaveBeenCalled();
  });

  it('refuses an image key for someone who is not staff anywhere', async () => {
    m.isStaffAnywhere.mockResolvedValue(false);
    await expect(
      requireUploadAccess(HEADERS, 'courses/xyz.avif'),
    ).rejects.toBeInstanceOf(m.ForbiddenError);
  });
});
