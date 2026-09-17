import { describe, expect, it } from 'vitest';
import {
  isLegacyAlternates,
  planLessonAlternates,
  type SynthesiaVideoIndex,
} from './migrate-other-video-ids';

const EN = 'e6ba6cbb-6bd7-451b-b314-a2f4822ca651';
const FR = '7425717c-cbfc-4418-aaba-0577948558ee';
const FR_CA = 'e9eecce0-f228-4bc1-9c66-af6851605498';
const OTHER_EN = '2f78036d-4527-4388-ba8b-99e22aebf88d';

const index: SynthesiaVideoIndex = {
  titleById: new Map([
    [EN, 'ITPS Origins and Background'],
    [FR, 'FR - ITPS Origins and Background'],
    [FR_CA, 'FR-CA - ITPS Origins and Background'],
    [OTHER_EN, 'Course Objectives v2'],
  ]),
};

describe('isLegacyAlternates', () => {
  it('recognises the old { lang, videoId } rows and nothing else', () => {
    expect(isLegacyAlternates([{ lang: 'FR', videoId: 'https://x' }])).toBe(
      true,
    );
    expect(
      isLegacyAlternates([{ lang: 'fr', provider: 'synthesia', ref: FR }]),
    ).toBe(false);
    expect(isLegacyAlternates([])).toBe(false);
    expect(isLegacyAlternates(null)).toBe(false);
  });
});

describe('planLessonAlternates', () => {
  it('resolves a share link to the same English video by looking up "FR - <title>"', () => {
    const plan = planLessonAlternates(
      {
        slug: 'itps-origins-dedication',
        videoRef: EN,
        legacy: [
          {
            lang: 'FR',
            videoId: `https://share.synthesia.io/${EN}?language=fr`,
          },
        ],
      },
      index,
    );
    expect(plan).toEqual({
      slug: 'itps-origins-dedication',
      resolved: [
        {
          lang: 'fr',
          provider: 'synthesia',
          ref: FR,
          title: 'FR - ITPS Origins and Background',
          how: 'by-title',
        },
      ],
      unresolved: [],
    });
  });

  it('uses a link that already names the French video directly, whatever the host', () => {
    const plan = planLessonAlternates(
      {
        slug: 'dealing-with-discord',
        videoRef: EN,
        legacy: [
          {
            lang: 'FR',
            videoId: `https://app.synthesia.io/#/video/${FR}?version=2`,
          },
        ],
      },
      index,
    );
    expect(plan.resolved[0]).toMatchObject({ lang: 'fr', ref: FR, how: 'direct' });
  });

  it('prefers the exact "FR - " render over "FR-CA - " and maps the prefix to the code', () => {
    const onlyCa: SynthesiaVideoIndex = {
      titleById: new Map([
        [EN, 'ITPS Origins and Background'],
        [FR_CA, 'FR-CA - ITPS Origins and Background'],
      ]),
    };
    const plan = planLessonAlternates(
      {
        slug: 's',
        videoRef: EN,
        legacy: [{ lang: 'FR', videoId: `https://share.synthesia.io/${EN}` }],
      },
      onlyCa,
    );
    expect(plan.resolved[0]).toMatchObject({ lang: 'fr-CA', ref: FR_CA });
  });

  it('ignores a wrong English uuid in the old link and still resolves from the lesson\'s own video', () => {
    const plan = planLessonAlternates(
      {
        slug: 'admin-comments',
        videoRef: EN,
        legacy: [
          {
            lang: 'FR',
            videoId: `https://share.synthesia.io/${OTHER_EN}?language=fr`,
          },
        ],
      },
      index,
    );
    expect(plan.resolved[0]).toMatchObject({ ref: FR, how: 'by-title' });
  });

  it('reports a lesson whose video has no French render as unresolved, touching nothing', () => {
    const plan = planLessonAlternates(
      {
        slug: 'what-you-will-learn',
        videoRef: OTHER_EN,
        legacy: [
          {
            lang: 'FR',
            videoId: `https://share.synthesia.io/${OTHER_EN}?language=fr`,
          },
        ],
      },
      index,
    );
    expect(plan.resolved).toEqual([]);
    expect(plan.unresolved).toEqual([
      { lang: 'FR', reason: 'no FR render of "Course Objectives v2" in the account' },
    ]);
  });

  it('refuses a language other than FR rather than guessing a code', () => {
    const plan = planLessonAlternates(
      {
        slug: 's',
        videoRef: EN,
        legacy: [{ lang: 'JP', videoId: `https://share.synthesia.io/${EN}` }],
      },
      index,
    );
    expect(plan.unresolved[0]).toMatchObject({ lang: 'JP' });
  });
});
