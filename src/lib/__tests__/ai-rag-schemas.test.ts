import { describe, expect, it } from 'vitest';
import {
  aiRagPostSchema,
  aiRagDeleteSchema,
  parseCourseIdParam,
} from '#/lib/ai-rag-schemas';

describe('aiRagPostSchema', () => {
  it('accepts text mode without courseId', () => {
    const r = aiRagPostSchema.safeParse({
      mode: 'text',
      sourcePath: 'doc-1',
      html: '<p>hello world this is long enough</p>',
    });
    expect(r.success).toBe(true);
  });
  it('accepts file mode with courseId', () => {
    const r = aiRagPostSchema.safeParse({
      mode: 'file',
      courseId: 3,
      url: 'https://blob.vercel-storage.com/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(true);
  });
  it('rejects text mode missing html', () => {
    const r = aiRagPostSchema.safeParse({ mode: 'text', sourcePath: 'd' });
    expect(r.success).toBe(false);
  });
  it('rejects unknown mode', () => {
    const r = aiRagPostSchema.safeParse({ mode: 'nope' });
    expect(r.success).toBe(false);
  });
  it('rejects non-positive courseId', () => {
    const r = aiRagPostSchema.safeParse({
      mode: 'text',
      courseId: 0,
      sourcePath: 'd',
      html: 'x'.repeat(30),
    });
    expect(r.success).toBe(false);
  });
});

describe('aiRagDeleteSchema', () => {
  it('requires sourcePath', () => {
    expect(aiRagDeleteSchema.safeParse({ courseId: 1 }).success).toBe(false);
    expect(aiRagDeleteSchema.safeParse({ sourcePath: 'd' }).success).toBe(true);
  });
});

describe('parseCourseIdParam', () => {
  it('returns null when omitted', () => {
    expect(parseCourseIdParam(null)).toBeNull();
  });
  it('returns the number when valid', () => {
    expect(parseCourseIdParam('4')).toBe(4);
  });
  it('returns undefined when invalid', () => {
    expect(parseCourseIdParam('abc')).toBeUndefined();
    expect(parseCourseIdParam('0')).toBeUndefined();
  });
});
