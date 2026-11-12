// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AnswerMetricsSchema,
  DEBRIEF_ANSWER_MAX_CHARS,
} from '../answer-metrics';

const ok = {
  msOnQuestion: 61_000,
  msToFirstKey: 4_000,
  deletions: 3,
  charsDeleted: 25,
  rewrites: 1,
  pasteBlocked: 2,
  msHidden: 6_000,
  finalLength: 240,
};

describe('AnswerMetricsSchema', () => {
  it('accepts the eight non-negative integer metrics', () => {
    expect(AnswerMetricsSchema.parse(ok)).toEqual(ok);
  });

  it.each(Object.keys(ok))('rejects a negative or fractional %s', (key) => {
    expect(AnswerMetricsSchema.safeParse({ ...ok, [key]: -1 }).success).toBe(
      false,
    );
    expect(AnswerMetricsSchema.safeParse({ ...ok, [key]: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects a missing metric', () => {
    const { rewrites: _drop, ...rest } = ok;
    expect(AnswerMetricsSchema.safeParse(rest).success).toBe(false);
  });

  it('caps answers and drafts at 10,000 characters', () => {
    expect(DEBRIEF_ANSWER_MAX_CHARS).toBe(10_000);
  });
});
