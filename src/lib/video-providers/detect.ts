import { PROVIDER_IDS, VIDEO_PROVIDERS } from './index';
import type { ProviderId } from './types';

/** First provider whose detect() matches, with the normalized ref. */
export function detectVideoUrl(
  url: string,
): { provider: ProviderId; ref: string } | null {
  for (const id of PROVIDER_IDS) {
    const hit = VIDEO_PROVIDERS[id].detect(url);
    if (hit) return { provider: id, ref: hit.ref };
  }
  return null;
}
