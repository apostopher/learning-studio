import { describe, expect, it } from 'vitest';
import {
  availableLanguages,
  badgeForLang,
  isVideoLang,
  labelForLang,
  orderedLanguages,
  removeAlternate,
  upsertAlternate,
  videoLangSchema,
} from '#/lib/video-languages';

describe('video languages', () => {
  it('labels a code with its English display name', () => {
    expect(labelForLang('en')).toBe('English');
    expect(labelForLang('fr-CA')).toBe('Canadian French');
  });

  it('badges a code in upper case, region kept', () => {
    expect(badgeForLang('en')).toBe('EN');
    expect(badgeForLang('fr-CA')).toBe('FR-CA');
    expect(badgeForLang('pt-BR')).toBe('PT-BR');
  });

  it('orders languages as en first, then in the curated order, deduped', () => {
    expect(orderedLanguages(['ja', 'fr-CA', 'fr', 'ja'])).toEqual([
      'en',
      'fr',
      'fr-CA',
      'ja',
    ]);
    expect(orderedLanguages([])).toEqual(['en']);
  });

  it('lists the languages an admin can still add', () => {
    const left = availableLanguages(['fr', 'ja']);
    expect(left).not.toContain('fr');
    expect(left).not.toContain('ja');
    expect(left).not.toContain('en');
    expect(left[0]).toBe('fr-CA');
  });

  it('upserts by lang, keeping one row per language', () => {
    const list = [
      { lang: 'fr' as const, provider: 'synthesia' as const, ref: 'a' },
    ];
    const next = upsertAlternate(list, {
      lang: 'fr',
      provider: 'synthesia',
      ref: 'b',
    });
    expect(next).toEqual([{ lang: 'fr', provider: 'synthesia', ref: 'b' }]);
    const added = upsertAlternate(next, {
      lang: 'ja',
      provider: 'mux',
      ref: 'c',
    });
    expect(added).toHaveLength(2);
    expect(list).toHaveLength(1); // input untouched
  });

  it('removes by lang', () => {
    const list = [
      { lang: 'fr' as const, provider: 'synthesia' as const, ref: 'a' },
      { lang: 'ja' as const, provider: 'synthesia' as const, ref: 'b' },
    ];
    expect(removeAlternate(list, 'fr')).toEqual([list[1]]);
  });

  it('accepts known codes and rejects unknown ones', () => {
    expect(videoLangSchema.safeParse('fr-CA').success).toBe(true);
    expect(videoLangSchema.safeParse('FR').success).toBe(false);
    expect(isVideoLang('xx')).toBe(false);
  });
});
