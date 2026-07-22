import { describe, expect, it } from 'vitest';
import { createEmptyQuestion } from '#/components/admin/onboarding-helpers';

describe('createEmptyQuestion', () => {
  it('makes a question with a non-empty id and empty text', () => {
    const q = createEmptyQuestion();
    expect(typeof q.id).toBe('string');
    expect(q.id.length).toBeGreaterThan(0);
    expect(q.text).toBe('');
  });
  it('makes a unique id each call', () => {
    expect(createEmptyQuestion().id).not.toBe(createEmptyQuestion().id);
  });
});
