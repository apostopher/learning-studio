import { describe, expect, it } from 'vitest';
import {
  OnboardingConsentEvaluationSchema,
  OnboardingReplyEvaluationSchema,
} from '#/types';

describe('OnboardingConsentEvaluationSchema', () => {
  it.each([
    'consented',
    'declined',
    'needs_clarification',
  ])('accepts status %s', (status) => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status,
      reply: null,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a reply string', () => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status: 'needs_clarification',
      reply: 'We use it to pace the course, nothing else.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status: 'maybe',
      reply: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a missing reply key', () => {
    const r = OnboardingConsentEvaluationSchema.safeParse({
      status: 'consented',
    });
    expect(r.success).toBe(false);
  });
});

describe('OnboardingReplyEvaluationSchema', () => {
  it.each([
    'answered',
    'needs_follow_up',
    'declined',
    'wants_pause',
    'wants_delete',
  ])('accepts status %s', (status) => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status,
      answer: null,
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a full answered evaluation', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'answered',
      answer: 'Two years, mostly FPV.',
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'skipped',
      answer: null,
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-boolean hesitancy', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'answered',
      answer: 'x',
      followUp: null,
      hesitancy: 'yes',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an answer over 5000 chars, matching the storage cap', () => {
    const r = OnboardingReplyEvaluationSchema.safeParse({
      status: 'answered',
      answer: 'x'.repeat(5001),
      followUp: null,
      hesitancy: false,
    });
    expect(r.success).toBe(false);
  });
});
