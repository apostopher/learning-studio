// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => vi.fn((_p: Record<string, unknown>) => null));
vi.mock('#/components/video-player', () => ({ VideoPlayerContainer: player }));

import { learnerPlaybackSchema } from '#/lib/admin-schemas';
import { VideoPreview } from '../video-preview';

const parsed = learnerPlaybackSchema.parse({
  status: 'ready',
  url: 'https://stream.mux.com/abc.m3u8?token=t',
  kind: 'hls',
  expiresInSeconds: 3600,
  poster: null,
  captions: { vtt: 'https://cdn/fr.vtt' },
  lang: 'fr',
  languages: ['en', 'fr'],
});
// Narrowed so `{ ...ready, captions: null }` type-checks as a ready body.
if (parsed.status !== 'ready') throw new Error('fixture must be ready');
const ready = parsed;

describe('VideoPreview', () => {
  it('hands the shared player the source, captions and language menu', () => {
    const onLanguageChange = vi.fn();
    const onSourceExpired = vi.fn();
    const onPlaybackFailed = vi.fn();
    render(
      <VideoPreview
        playback={ready}
        onLanguageChange={onLanguageChange}
        onSourceExpired={onSourceExpired}
        onPlaybackFailed={onPlaybackFailed}
      />,
    );
    const props = player.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      src: 'https://stream.mux.com/abc.m3u8?token=t',
      kind: 'hls',
      captions: [{ src: 'https://cdn/fr.vtt', lang: 'fr' }],
      captionsUnavailable: false,
      activeLanguage: 'fr',
      onLanguageChange,
      onSourceExpired,
      onPlaybackFailed,
    });
    expect((props?.languages as { code: string }[]).map((l) => l.code)).toEqual(
      ['en', 'fr'],
    );
  });

  it('discloses a video with no captions instead of hiding CC', () => {
    render(<VideoPreview playback={{ ...ready, captions: null }} />);
    expect(player.mock.calls.at(-1)?.[0]).toMatchObject({
      captions: [],
      captionsUnavailable: true,
    });
  });

  it('shows the placeholder, not a player, when nothing is ready', () => {
    player.mockClear();
    const { container } = render(<VideoPreview playback={null} />);
    expect(player).not.toHaveBeenCalled();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
