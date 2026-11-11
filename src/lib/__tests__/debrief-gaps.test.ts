import { describe, expect, it } from 'vitest';
import type { AIEvaluationResult } from '#/ai/schemas';
import { debriefGaps, recentLessonGaps } from '#/lib/debrief-gaps';

const ev = (over: Partial<AIEvaluationResult>): AIEvaluationResult => ({
  questionId: 'q',
  type: 'free-text',
  score: 50,
  userAnswer: 'a',
  explanation: 'e',
  ...over,
});

describe('debriefGaps', () => {
  it('lists the ideas missed or half-conveyed, and the incorrect claims, once each', () => {
    expect(
      debriefGaps([
        ev({
          essentialIdeas: [
            { idea: 'Human in the loop', conveyed: 'not' },
            { idea: 'Radio command link', conveyed: 'partly' },
            { idea: 'Wireless control', conveyed: 'fully' },
          ],
          incorrectClaims: ['Squawk 7700 for radio failure'],
        }),
        ev({
          essentialIdeas: [{ idea: 'Human in the loop', conveyed: 'not' }],
        }),
      ]),
    ).toEqual({
      missed: ['Human in the loop', 'Radio command link'],
      incorrect: ['Squawk 7700 for radio failure'],
    });
  });

  it('has nothing to say for answers saved before judgements were kept', () => {
    expect(debriefGaps([ev({}), ev({ type: 'mcq', score: 0 })])).toEqual({
      missed: [],
      incorrect: [],
    });
  });
});

describe('recentLessonGaps', () => {
  const gap = [
    ev({ essentialIdeas: [{ idea: 'Datalink loss', conveyed: 'not' }] }),
  ];

  it("takes each lesson's LATEST attempt, newest lessons first, and drops lessons with no gaps", () => {
    expect(
      recentLessonGaps(
        [
          // newest first, as the read orders them
          { lessonName: 'RPGEN 02', lessonSlug: 'b', answers: gap },
          { lessonName: 'RPGEN 01', lessonSlug: 'a', answers: [ev({})] },
          { lessonName: 'RPGEN 02', lessonSlug: 'b', answers: [ev({})] },
          { lessonName: 'RPGEN 01', lessonSlug: 'a', answers: gap },
        ],
        5,
      ),
    ).toEqual([
      { lessonName: 'RPGEN 02', missed: ['Datalink loss'], incorrect: [] },
    ]);
  });

  it('stops at the limit', () => {
    const rows = ['a', 'b', 'c'].map((s) => ({
      lessonName: s,
      lessonSlug: s,
      answers: gap,
    }));
    expect(recentLessonGaps(rows, 2).map((g) => g.lessonName)).toEqual([
      'a',
      'b',
    ]);
  });

  it('ignores stored answers that no longer parse', () => {
    expect(
      recentLessonGaps(
        [{ lessonName: 'x', lessonSlug: 'x', answers: 'not an array' }],
        5,
      ),
    ).toEqual([]);
  });
});
