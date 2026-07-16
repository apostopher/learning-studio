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
