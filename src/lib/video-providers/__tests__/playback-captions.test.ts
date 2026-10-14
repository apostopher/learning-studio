import { describe, expect, it } from 'vitest';
import { labelForLang } from '#/lib/video-languages';
import { captionsForPlayback } from '#/lib/video-providers/playback-captions';

describe('captionsForPlayback', () => {
  it('labels the provider VTT with the language that is playing', () => {
    expect(captionsForPlayback({ vtt: 'https://cdn/c.vtt' }, 'fr')).toEqual([
      { src: 'https://cdn/c.vtt', lang: 'fr', label: labelForLang('fr') },
    ]);
  });

  it('is empty when the provider has no captions', () => {
    expect(captionsForPlayback(null, 'en')).toEqual([]);
  });
});
