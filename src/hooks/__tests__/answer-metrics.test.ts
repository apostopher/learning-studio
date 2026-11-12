import { describe, expect, it } from 'vitest';
import { AnswerMetricsSchema } from '#/lib/answer-metrics';
import {
  type MetricsEvent,
  metricsSnapshot,
  reduceAnswerMetrics,
  startMetrics,
} from '../use-answer-metrics';

const run = (events: MetricsEvent[], shownAt = 0) =>
  events.reduce(reduceAnswerMetrics, startMetrics(shownAt));

const typed = (n: number): MetricsEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    type: 'input' as const,
    deltaRemoved: 0,
    length: i + 1,
  }));

describe('reduceAnswerMetrics', () => {
  it('counts typing 40 chars then deleting 25 in one run as one rewrite', () => {
    const s = run([
      ...typed(40),
      { type: 'input', deltaRemoved: 25, length: 15 },
    ]);
    expect(s.rewrites).toBe(1);
    expect(s.charsDeleted).toBe(25);
    expect(s.deletions).toBe(1);
  });

  it('counts one rewrite for a run of single-character deletions', () => {
    const dels: MetricsEvent[] = Array.from({ length: 25 }, (_, i) => ({
      type: 'input' as const,
      deltaRemoved: 1,
      length: 39 - i,
    }));
    const s = run([...typed(40), ...dels]);
    expect(s.rewrites).toBe(1);
    expect(s.deletions).toBe(25);
  });

  it('does not count a small deletion as a rewrite', () => {
    const s = run([
      ...typed(40),
      { type: 'input', deltaRemoved: 20, length: 20 },
    ]);
    expect(s.rewrites).toBe(0);
  });

  it('sums two hidden spans of 3 s', () => {
    const s = run([
      { type: 'visibility', hidden: true, at: 1000 },
      { type: 'visibility', hidden: false, at: 4000 },
      { type: 'visibility', hidden: true, at: 10_000 },
      { type: 'visibility', hidden: false, at: 13_000 },
    ]);
    expect(s.msHidden).toBe(6000);
  });

  it('counts blocked pastes and the first key', () => {
    const s = run(
      [
        { type: 'paste-blocked' },
        { type: 'keydown', at: 2500 },
        { type: 'keydown', at: 3000 },
      ],
      1000,
    );
    expect(s.pasteBlocked).toBe(1);
    expect(s.msToFirstKey).toBe(1500);
  });

  it('closes a still-open hidden span on submit and yields a schema-valid snapshot', () => {
    const s = run(
      [
        { type: 'visibility', hidden: true, at: 1000 },
        { type: 'submit', at: 5000, length: 12 },
      ],
      0,
    );
    const snap = metricsSnapshot(s);
    expect(AnswerMetricsSchema.parse(snap)).toEqual(snap);
    expect(snap.msHidden).toBe(4000);
    expect(snap.msOnQuestion).toBe(5000);
    expect(snap.finalLength).toBe(12);
    expect(Object.keys(snap).sort()).toEqual(
      Object.keys(AnswerMetricsSchema.shape).sort(),
    );
  });
});
