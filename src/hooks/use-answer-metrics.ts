import { useCallback, useEffect, useRef } from 'react';
import type { AnswerMetrics } from '#/lib/answer-metrics';

/**
 * What the answer box reports. `at` is a millisecond timestamp
 * (`Date.now()`); `length` is the answer's length after the event.
 */
export type MetricsEvent =
  | { type: 'keydown'; at: number }
  | { type: 'input'; deltaRemoved: number; length: number }
  | { type: 'paste-blocked' }
  | { type: 'visibility'; hidden: boolean; at: number }
  | { type: 'submit'; at: number; length: number };

/**
 * `AnswerMetrics` plus the bookkeeping needed to derive it. Only the
 * `AnswerMetrics` fields leave this module (see `metricsSnapshot`).
 */
export type MetricsState = AnswerMetrics & {
  shownAt: number;
  firstKeySeen: boolean;
  hiddenSince: number | null;
  longest: number;
  /** Characters deleted in the current unbroken run of deletions. */
  runRemoved: number;
  runCounted: boolean;
  length: number;
};

export const startMetrics = (shownAt: number): MetricsState => ({
  msOnQuestion: 0,
  msToFirstKey: 0,
  deletions: 0,
  charsDeleted: 0,
  rewrites: 0,
  pasteBlocked: 0,
  msHidden: 0,
  finalLength: 0,
  shownAt,
  firstKeySeen: false,
  hiddenSince: null,
  longest: 0,
  runRemoved: 0,
  runCounted: false,
  length: 0,
});

const nonNegative = (n: number) => Math.max(0, Math.round(n));

export function reduceAnswerMetrics(
  prev: MetricsState,
  event: MetricsEvent,
): MetricsState {
  switch (event.type) {
    case 'keydown':
      if (prev.firstKeySeen) return prev;
      return {
        ...prev,
        firstKeySeen: true,
        msToFirstKey: nonNegative(event.at - prev.shownAt),
      };
    case 'paste-blocked':
      return { ...prev, pasteBlocked: prev.pasteBlocked + 1 };
    case 'visibility': {
      if (event.hidden) {
        return prev.hiddenSince === null
          ? { ...prev, hiddenSince: event.at }
          : prev;
      }
      if (prev.hiddenSince === null) return prev;
      return {
        ...prev,
        hiddenSince: null,
        msHidden: prev.msHidden + nonNegative(event.at - prev.hiddenSince),
      };
    }
    case 'input': {
      const longest = Math.max(prev.longest, event.length);
      if (event.deltaRemoved <= 0) {
        // Typing ends any run of deletions.
        return {
          ...prev,
          longest,
          length: event.length,
          runRemoved: 0,
          runCounted: false,
        };
      }
      const runRemoved = prev.runRemoved + event.deltaRemoved;
      // A rewrite: more than half of the longest answer so far, deleted in
      // one run — counted once per run.
      const isRewrite = !prev.runCounted && runRemoved * 2 > longest;
      return {
        ...prev,
        longest,
        length: event.length,
        deletions: prev.deletions + 1,
        charsDeleted: prev.charsDeleted + event.deltaRemoved,
        rewrites: prev.rewrites + (isRewrite ? 1 : 0),
        runRemoved,
        runCounted: prev.runCounted || isRewrite,
      };
    }
    case 'submit': {
      const closed =
        prev.hiddenSince === null
          ? prev
          : {
              ...prev,
              hiddenSince: null,
              msHidden:
                prev.msHidden + nonNegative(event.at - prev.hiddenSince),
            };
      return {
        ...closed,
        msOnQuestion: nonNegative(event.at - prev.shownAt),
        finalLength: event.length,
        length: event.length,
      };
    }
  }
}

/** The wire shape: exactly the fields of `AnswerMetrics`. */
export const metricsSnapshot = (s: MetricsState): AnswerMetrics => ({
  msOnQuestion: s.msOnQuestion,
  msToFirstKey: s.msToFirstKey,
  deletions: s.deletions,
  charsDeleted: s.charsDeleted,
  rewrites: s.rewrites,
  pasteBlocked: s.pasteBlocked,
  msHidden: s.msHidden,
  finalLength: s.finalLength,
});

/**
 * Metrics for the question on screen, held in a ref so keystrokes never
 * re-render. `record` feeds events; `snapshot` reads what to send with the
 * answer (record a `submit` first); `reset` starts the next question.
 * Tab visibility is tracked here.
 */
export function useAnswerMetrics() {
  const state = useRef<MetricsState | null>(null);
  if (state.current === null) state.current = startMetrics(Date.now());

  const record = useCallback((event: MetricsEvent) => {
    state.current = reduceAnswerMetrics(
      state.current ?? startMetrics(Date.now()),
      event,
    );
  }, []);

  const snapshot = useCallback(
    (): AnswerMetrics =>
      metricsSnapshot(state.current ?? startMetrics(Date.now())),
    [],
  );

  const reset = useCallback(() => {
    const now = Date.now();
    state.current = startMetrics(now);
    if (document.visibilityState === 'hidden') {
      record({ type: 'visibility', hidden: true, at: now });
    }
  }, [record]);

  useEffect(() => {
    const onChange = () =>
      record({
        type: 'visibility',
        hidden: document.visibilityState === 'hidden',
        at: Date.now(),
      });
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [record]);

  return { record, snapshot, reset };
}
