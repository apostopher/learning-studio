import { describe, expect, it } from 'vitest';
import { computeMaterialTabs } from '#/components/lesson-material/compute-material-tabs';
import { showsTranscriptDebriefSection } from '#/components/lesson-material/compute-transcript-debrief';
import {
  shouldPrepareDebrief,
  shouldPrepareDebriefOnVisit,
} from '#/data-hooks/use-prepare-debrief';
import { canOfferDebrief } from '#/lib/debrief-offer';

describe('canOfferDebrief', () => {
  it('mirrors resolveDebriefSource: material text first, then a usable transcript', () => {
    expect(
      canOfferDebrief({
        materialText: 'body',
        transcriptUsable: false,
      }),
    ).toBe(true);
    expect(
      canOfferDebrief({
        materialText: null,
        transcriptUsable: true,
      }),
    ).toBe(true);
    // A material row with an empty body falls through to the transcript, as
    // the generator's `if (material?.text)` does.
    expect(
      canOfferDebrief({
        materialText: '',
        transcriptUsable: true,
      }),
    ).toBe(true);
    expect(
      canOfferDebrief({
        materialText: '',
        transcriptUsable: false,
      }),
    ).toBe(false);
  });
});

/**
 * Every surface that offers or prepares a debrief must agree. When they did
 * not, a lesson with a material row but no body text and a captioned video got
 * a prepared transcript debrief — so the SQL counted it debrief-bearing and the
 * ring showed a red D — while the material panel offered no Debrief tab and no
 * section, leaving course percent and promotion blocked forever.
 *
 * Each assertion reads what the consumer itself returned from raw inputs; none
 * is handed a precomputed answer.
 */
describe('debrief surfaces agree (not read-only)', () => {
  const combos = [
    { materialText: 'body', transcriptUsable: true, expected: true },
    { materialText: 'body', transcriptUsable: false, expected: true },
    { materialText: '', transcriptUsable: true, expected: true },
    { materialText: '', transcriptUsable: false, expected: false },
  ] as const;

  it.each(
    combos,
  )('text=$materialText captions=$transcriptUsable → $expected', ({
    materialText,
    transcriptUsable,
    expected,
  }) => {
    const debrief = {
      materialText,
      transcriptUsable,
      readOnly: false,
    };

    // The Debrief tab, on a lesson whose material row exists.
    const tabs = computeMaterialTabs({
      hasQuiz: false,
      debrief,
      extraTab: 'testThis',
      courseSlug: 'uas-16-week-course',
    });
    expect(tabs.some((t) => t.value === 'debrief')).toBe(expected);

    // Prepare-on-play (player) and prepare-on-visit (no-video lesson).
    expect(
      shouldPrepareDebrief({
        ...debrief,
        playing: true,
        alreadyRequested: false,
      }),
    ).toBe(expected);
    expect(
      shouldPrepareDebriefOnVisit({ ...debrief, alreadyRequested: false }),
    ).toBe(expected);

    // The transcript-only section shows only with NO material row, so the
    // row's text is absent by construction: it must agree on the two
    // no-text combinations, and a text combination never reaches it.
    if (!materialText) {
      expect(
        showsTranscriptDebriefSection({
          transcriptUsable,
          readOnly: false,
        }),
      ).toBe(expected);
    }
  });

  it('all surfaces refuse a read-only lesson (call 12)', () => {
    const debrief = {
      materialText: 'body',
      transcriptUsable: true,
      readOnly: true,
    };
    expect(
      computeMaterialTabs({
        hasQuiz: false,
        debrief,
        extraTab: 'testThis',
        courseSlug: 'uas-16-week-course',
      }).some((t) => t.value === 'debrief'),
    ).toBe(false);
    expect(
      shouldPrepareDebrief({
        ...debrief,
        playing: true,
        alreadyRequested: false,
      }),
    ).toBe(false);
    expect(
      showsTranscriptDebriefSection({
        transcriptUsable: true,
        readOnly: true,
      }),
    ).toBe(false);
  });
});
