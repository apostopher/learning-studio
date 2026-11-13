import { describe, expect, it } from 'vitest';
import { matchesOpenDebriefQuestion } from '../debrief-question-guard';

// The question a learner pasted into Viper (2026-11-13).
const Q =
  "During a time-critical data capture run, your FTE radios a non-standard phrase that you've never heard before. Why is this a problem, and what should your crew do differently going forward?";

describe('matchesOpenDebriefQuestion', () => {
  it('catches the question pasted verbatim', () => {
    expect(matchesOpenDebriefQuestion(Q, [Q])).toBe(true);
  });

  it('catches it inside a longer message, whatever the case and punctuation', () => {
    expect(
      matchesOpenDebriefQuestion(
        `hey viper, can you answer this: ${Q.toUpperCase().replace(/[,.?]/g, '')} thanks!!`,
        [Q],
      ),
    ).toBe(true);
  });

  it('catches a lightly retyped copy', () => {
    expect(
      matchesOpenDebriefQuestion(
        'during a time critical data capture run my FTE radios a nonstandard phrase i never heard before. why is that a problem and what should the crew do differently going forward',
        [Q],
      ),
    ).toBe(true);
  });

  it('catches a copy of just its question sentence', () => {
    expect(
      matchesOpenDebriefQuestion(
        'why is a non-standard phrase from the FTE a problem during a time-critical data capture run, and what should the crew do differently going forward?',
        [Q],
      ),
    ).toBe(true);
  });

  it('lets an ordinary question on the same topic through', () => {
    expect(
      matchesOpenDebriefQuestion(
        'what does standard phraseology mean in flight test?',
        [Q],
      ),
    ).toBe(false);
    expect(matchesOpenDebriefQuestion('what does FTE stand for?', [Q])).toBe(
      false,
    );
  });

  it('matches nothing with no open questions', () => {
    expect(matchesOpenDebriefQuestion(Q, [])).toBe(false);
  });

  it('checks every open question', () => {
    expect(
      matchesOpenDebriefQuestion(Q, ['Explain lift in your own words.', Q]),
    ).toBe(true);
  });
});
