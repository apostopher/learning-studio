import { describe, expect, it } from 'vitest';
import { selectVideoForLang } from '../select-video-for-lang';

const primary = { provider: 'synthesia' as const, ref: 'en-ref' };
const alternates = [
  { lang: 'fr-CA' as const, provider: 'synthesia' as const, ref: 'fr-ref' },
  { lang: 'ja' as const, provider: 'mux' as const, ref: 'ja-ref' },
];

describe('selectVideoForLang', () => {
  it("plays the alternate for a requested lang that exists, with that row's provider", () => {
    expect(
      selectVideoForLang({ primary, alternates, requested: 'ja' }),
    ).toEqual({
      provider: 'mux',
      ref: 'ja-ref',
      lang: 'ja',
      languages: ['en', 'fr-CA', 'ja'],
    });
  });

  it('falls back to the primary, reporting lang en, when the requested lang is not attached', () => {
    expect(
      selectVideoForLang({ primary, alternates, requested: 'de' }),
    ).toEqual({
      provider: 'synthesia',
      ref: 'en-ref',
      lang: 'en',
      languages: ['en', 'fr-CA', 'ja'],
    });
  });

  it('plays the primary for en', () => {
    expect(
      selectVideoForLang({ primary, alternates: [], requested: 'en' }),
    ).toEqual({
      provider: 'synthesia',
      ref: 'en-ref',
      lang: 'en',
      languages: ['en'],
    });
  });
});
