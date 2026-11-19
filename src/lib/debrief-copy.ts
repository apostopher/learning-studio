/**
 * What the Debrief tab says at each turn of an attempt, word for word from
 * the stakeholder doc (RGS scoring, 2026-11-20). Not to be reworded here.
 */

/** Set 1 passed and set 2 is offered: the doc's copy, for a set 2 of four. */
export const DEBRIEF_PASS_OFFER_COPY =
  "That's great. Based on these answers you've met or exceeded the standard for this knowledge chunk. You can still try to improve your score by answering four more questions from different KEYS. It will only affect your score if you do better";

/** The pilot said No to the offer. */
export const DEBRIEF_DECLINE_COPY =
  "Okay that's fine. Just proceed to the next video.";

/** Set 1 missed: set 2 comes next. */
export const DEBRIEF_SET1_MISSED_COPY =
  "Let's try some of the other teaching points";

/** Both sets missed: Retake now or Later. */
export const DEBRIEF_TWO_MISSED_COPY =
  'Not quite there yet. Study the KEYS or rewatch the video, or both, then retake the debrief. You can do it now or any time before the end of your training.';

const NUMBER_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
};

/**
 * The offer's copy for a set 2 of `set2Count` questions. Set 2 holds what is
 * left of up to eight key points after set 1's four, so 1 to 4; the doc's
 * "four" becomes that number's word ("one more question" in the singular).
 */
export function passOfferCopy(set2Count: number): string {
  if (set2Count === 4) return DEBRIEF_PASS_OFFER_COPY;
  const word = NUMBER_WORDS[set2Count] ?? String(set2Count);
  const noun = set2Count === 1 ? 'question' : 'questions';
  return DEBRIEF_PASS_OFFER_COPY.replace(
    'answering four more questions',
    `answering ${word} more ${noun}`,
  );
}

/** The offer's buttons. */
export const DEBRIEF_OFFER_YES = 'Yes';
export const DEBRIEF_OFFER_NO = 'No';

/** After two misses. */
export const DEBRIEF_RETAKE_NOW = 'Retake now';
export const DEBRIEF_RETAKE_LATER = 'Later';
