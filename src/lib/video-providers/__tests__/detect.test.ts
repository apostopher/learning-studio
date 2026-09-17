import { describe, expect, it } from 'vitest';
import { detectVideoUrl } from '../detect';

describe('detectVideoUrl', () => {
  it('detects a Synthesia share URL', () => {
    expect(
      detectVideoUrl(
        'https://share.synthesia.io/11111111-2222-3333-4444-555555555555',
      ),
    ).toEqual({
      provider: 'synthesia',
      ref: '11111111-2222-3333-4444-555555555555',
    });
  });
  it('detects a Synthesia editor URL, whose id lives in the hash route', () => {
    expect(
      detectVideoUrl(
        'https://app.synthesia.io/#/video-edit/16c1e1f9-eae0-4ed1-aed9-d6d4e661d093',
      ),
    ).toEqual({
      provider: 'synthesia',
      ref: '16c1e1f9-eae0-4ed1-aed9-d6d4e661d093',
    });
  });
  it('still detects a Synthesia share URL that carries a fragment', () => {
    // The hash-router fix for editor links must not break the plain share
    // link: `pathname + hash` joined the fragment onto the id.
    expect(
      detectVideoUrl(
        'https://share.synthesia.io/11111111-2222-3333-4444-555555555555#foo',
      ),
    ).toEqual({
      provider: 'synthesia',
      ref: '11111111-2222-3333-4444-555555555555',
    });
  });
  it('detects a Mux stream URL and strips extension/query', () => {
    expect(
      detectVideoUrl('https://stream.mux.com/AbCd1234Ef.m3u8?token=x'),
    ).toEqual({ provider: 'mux', ref: 'AbCd1234Ef' });
  });
  it('returns null for an unsupported / dashboard URL', () => {
    expect(detectVideoUrl('https://dashboard.mux.com/assets/xyz')).toBeNull();
    expect(detectVideoUrl('not a url')).toBeNull();
  });
});

describe('toUrl', () => {
  /**
   * The URL the video field is prefilled with must be one the same
   * provider's detector reads back to the same ref — otherwise the field
   * would open on a value the form calls unsupported.
   */
  it('round-trips through detect for every provider', async () => {
    const { PROVIDER_IDS, VIDEO_PROVIDERS } = await import('../index');
    const refs = {
      mux: 'abc123XYZ',
      synthesia: '123e4567-e89b-12d3-a456-426614174000',
    };
    for (const id of PROVIDER_IDS) {
      const url = VIDEO_PROVIDERS[id].toUrl(refs[id]);
      expect(url, id).toMatch(/^https:\/\//);
      expect(VIDEO_PROVIDERS[id].detect(url), id).toEqual({ ref: refs[id] });
    }
  });
});
