/**
 * Flatten a WebVTT caption file into plain prose.
 *
 * Pure and provider-agnostic so it can be tested without a network: the only
 * caller fetches a signed, expiring URL (see `db/lesson-transcript.ts`).
 *
 * Consecutive duplicate lines are collapsed. Synthesia's captions are rolling —
 * the same sentence is re-emitted across several cues as the highlight moves —
 * and feeding that repetition to the debrief generator makes it read the lesson
 * as far more repetitive than it is.
 */
const TIMESTAMP_LINE = /-->/;
const CUE_SETTINGS = /^(WEBVTT|NOTE|STYLE|REGION)\b/;
/** A bare cue identifier: VTT allows any text, but in practice it is a number. */
const CUE_NUMBER = /^\d+$/;
/** Inline cue markup: `<v Speaker>`, `<c.classname>`, `<00:00:01.000>`. */
const INLINE_TAGS = /<[^>]*>/g;

export function vttToText(vtt: string): string {
  const lines: string[] = [];
  let previous = '';

  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (TIMESTAMP_LINE.test(line)) continue;
    if (CUE_SETTINGS.test(line)) continue;
    if (CUE_NUMBER.test(line)) continue;

    const text = line.replace(INLINE_TAGS, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text === previous) continue;

    lines.push(text);
    previous = text;
  }

  return lines.join(' ');
}
