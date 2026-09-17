import { describe, expect, it } from 'vitest';
import { OtherVideoIdsSchema } from '#/types';

describe('OtherVideoIdsSchema', () => {
  it('accepts lang + provider + ref rows', () => {
    const parsed = OtherVideoIdsSchema.safeParse([
      {
        lang: 'fr-CA',
        provider: 'synthesia',
        ref: 'e9eecce0-f228-4bc1-9c66-af6851605498',
      },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects the legacy { lang: "FR", videoId } shape', () => {
    expect(
      OtherVideoIdsSchema.safeParse([
        { lang: 'FR', videoId: 'https://share.synthesia.io/x' },
      ]).success,
    ).toBe(false);
  });

  it('rejects en (the primary video is never an alternate) and two rows for one lang', () => {
    expect(
      OtherVideoIdsSchema.safeParse([{ lang: 'en', provider: 'mux', ref: 'a' }])
        .success,
    ).toBe(false);
    expect(
      OtherVideoIdsSchema.safeParse([
        { lang: 'fr', provider: 'mux', ref: 'a' },
        { lang: 'fr', provider: 'mux', ref: 'b' },
      ]).success,
    ).toBe(false);
  });
});
