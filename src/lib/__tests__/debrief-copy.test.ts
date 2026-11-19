import { describe, expect, it } from 'vitest';
import {
  DEBRIEF_DECLINE_COPY,
  DEBRIEF_PASS_OFFER_COPY,
  DEBRIEF_SET1_MISSED_COPY,
  DEBRIEF_TWO_MISSED_COPY,
  passOfferCopy,
} from '#/lib/debrief-copy';

describe('debrief copy', () => {
  it('is the stakeholder doc, word for word', () => {
    expect(DEBRIEF_PASS_OFFER_COPY).toBe(
      "That's great. Based on these answers you've met or exceeded the standard for this knowledge chunk. You can still try to improve your score by answering four more questions from different KEYS. It will only affect your score if you do better",
    );
    expect(DEBRIEF_DECLINE_COPY).toBe(
      "Okay that's fine. Just proceed to the next video.",
    );
    expect(DEBRIEF_SET1_MISSED_COPY).toBe(
      "Let's try some of the other teaching points",
    );
    expect(DEBRIEF_TWO_MISSED_COPY).toBe(
      'Not quite there yet. Study the KEYS or rewatch the video, or both, then retake the debrief. You can do it now or any time before the end of your training.',
    );
  });
});

describe('passOfferCopy', () => {
  it('is the doc copy for a set 2 of four', () => {
    expect(passOfferCopy(4)).toBe(DEBRIEF_PASS_OFFER_COPY);
  });

  it.each([
    [2, 'answering two more questions'],
    [3, 'answering three more questions'],
  ])('names a set 2 of %i in words', (n, phrase) => {
    expect(passOfferCopy(n)).toContain(phrase);
    expect(passOfferCopy(n)).not.toContain('four');
  });

  it('a set 2 of one is one more question, singular', () => {
    expect(passOfferCopy(1)).toContain('answering one more question from');
  });
});
