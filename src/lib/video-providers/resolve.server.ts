import Mux from '@mux/mux-node';
import {
  getVideoDetails,
  getVideoExpiry,
} from '@/integrations/synthesia/videos';
import { isVideoAvailable } from '@/types';
import { muxCredentialSchema } from './mux';
import { synthesiaCredentialSchema } from './synthesia';
import type { ProviderId } from './types';

export interface Playback {
  url: string;
  kind: 'hls' | 'file';
  expiresAt: number | null;
}

const MUX_TTL_SECONDS = 60 * 60; // 1h signed playback token

const mux = new Mux();

export async function resolvePlayback(
  provider: ProviderId,
  ref: string,
  creds: unknown,
): Promise<Playback> {
  if (provider === 'mux') {
    const { keyId, privateKey } = muxCredentialSchema.parse(creds);
    const token = await mux.jwt.signPlaybackId(ref, {
      keyId,
      keySecret: privateKey,
      expiration: `${MUX_TTL_SECONDS}s`,
      type: 'video',
    });
    return {
      url: `https://stream.mux.com/${ref}.m3u8?token=${token}`,
      kind: 'hls',
      expiresAt: Math.floor(Date.now() / 1000) + MUX_TTL_SECONDS,
    };
  }
  // synthesia
  const { apiKey } = synthesiaCredentialSchema.parse(creds);
  const details = await getVideoDetails(ref, apiKey);
  if (!isVideoAvailable(details) || !details.download) {
    throw new Error('VIDEO_NOT_AVAILABLE');
  }
  return {
    url: details.download,
    kind: details.download.endsWith('.m3u8') ? 'hls' : 'file',
    expiresAt: getVideoExpiry(details.download),
  };
}

export async function validateCredentials(
  provider: ProviderId,
  creds: unknown,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === 'mux') {
      const { keyId, privateKey } = muxCredentialSchema.parse(creds);
      // Structural check: the key must sign. Full validity confirmed on play.
      await mux.jwt.signPlaybackId('validation', {
        keyId,
        keySecret: privateKey,
        expiration: '30s',
        type: 'video',
      });
      return { ok: true };
    }
    const { apiKey } = synthesiaCredentialSchema.parse(creds);
    const res = await fetch('https://api.synthesia.io/v2/videos?limit=1', {
      headers: { Accept: 'application/json', Authorization: apiKey },
      cache: 'no-store',
    });
    return res.ok
      ? { ok: true }
      : { ok: false, error: `Synthesia returned ${res.status}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
