import { muxProvider } from './mux';
import { synthesiaProvider } from './synthesia';
import type { ProviderId, VideoProviderMeta } from './types';

export const VIDEO_PROVIDERS: Record<ProviderId, VideoProviderMeta> = {
  mux: muxProvider,
  synthesia: synthesiaProvider,
};

export const PROVIDER_IDS = Object.keys(VIDEO_PROVIDERS) as ProviderId[];
export type { ProviderId, VideoProviderMeta } from './types';
