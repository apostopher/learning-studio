import { describe, expect, it } from 'vitest';
import { vttToText } from '../vtt-to-text';

const VTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.500
Before every flight, confirm the battery is seated.

2
00:00:03.500 --> 00:00:07.000
Before every flight, confirm the battery is seated.
Then check the props for nicks.

NOTE this cue was re-timed

3
00:00:07.000 --> 00:00:09.000
<v Instructor>Log the airframe hours.</v>
`;

describe('vttToText', () => {
  it('keeps only the spoken lines, in order', () => {
    expect(vttToText(VTT)).toBe(
      'Before every flight, confirm the battery is seated. ' +
        'Then check the props for nicks. Log the airframe hours.',
    );
  });

  it('collapses the rolling repetition Synthesia captions emit', () => {
    // The first sentence appears in two consecutive cues above. Left in, the
    // debrief generator reads the lesson as far more repetitive than it is.
    const occurrences = vttToText(VTT).split('confirm the battery').length - 1;
    expect(occurrences).toBe(1);
  });

  it('drops the header, cue numbers, timings, and inline markup', () => {
    const text = vttToText(VTT);
    expect(text).not.toContain('WEBVTT');
    expect(text).not.toContain('-->');
    expect(text).not.toContain('NOTE');
    expect(text).not.toContain('<v');
  });

  it('returns an empty string for a caption file with no cues', () => {
    expect(vttToText('WEBVTT\n\n')).toBe('');
  });
});
