import Mux from '@mux/mux-node';
import { muxCredentialSchema } from './mux';
import type { MuxCaptionCode } from './mux-captions';
import type { MuxCaptionsApi } from './mux-captions-service';

/** Every Mux API call: a stuck request must not hold an admin save open. */
export const muxApiClient = (tokenId: string, tokenSecret: string) =>
  new Mux({ tokenId, tokenSecret, timeout: 10_000, maxRetries: 1 });

const isAuthStatus = (error: unknown): boolean => {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
};

/** `null` when the token works; otherwise the admin-facing reason. */
export async function checkMuxApiToken(
  tokenId: string,
  tokenSecret: string,
): Promise<string | null> {
  try {
    await muxApiClient(tokenId, tokenSecret).video.assets.list({ limit: 1 });
    return null;
  } catch (error) {
    return isAuthStatus(error)
      ? 'Mux rejected the API token.'
      : `Mux couldn't check the API token: ${(error as Error).message}`;
  }
}

/** The real Mux API behind the captions service. */
export function muxCaptionsApi(
  tokenId: string,
  tokenSecret: string,
): MuxCaptionsApi {
  const client = muxApiClient(tokenId, tokenSecret);
  return {
    async assetIdForPlayback(playbackId) {
      const { object } = await client.video.playbackIds.retrieve(playbackId);
      if (object.type !== 'asset') {
        throw new Error('this playback id is a live stream, not a video.');
      }
      return object.id;
    },
    async assetTracks(assetId) {
      const asset = await client.video.assets.retrieve(assetId);
      return asset.tracks ?? [];
    },
    async generateSubtitles(assetId, audioTrackId, code: MuxCaptionCode, name) {
      await client.video.assets.generateSubtitles(assetId, audioTrackId, {
        generated_subtitles: [{ language_code: code, name }],
      });
    },
  };
}

/** The captions API for a course's stored Mux credentials, or `null` with no API token. */
export function muxApiFromCreds(creds: unknown): MuxCaptionsApi | null {
  const parsed = muxCredentialSchema.safeParse(creds);
  if (!parsed.success) return null;
  const { apiTokenId, apiTokenSecret } = parsed.data;
  return apiTokenId && apiTokenSecret
    ? muxCaptionsApi(apiTokenId, apiTokenSecret)
    : null;
}
