import Mux from '@mux/mux-node';
import {
  getVideoDetails,
  getVideoExpiry,
  SynthesiaRequestError,
} from '../../integrations/synthesia/videos';
import { isVideoAvailable } from '../../types';
import { isAuthRejectionStatus, PlaybackError } from './errors';
import { muxCredentialSchema } from './mux';
import { synthesiaCredentialSchema } from './synthesia';
import type { ProviderId } from './types';

export interface Playback {
  url: string;
  kind: 'hls' | 'file';
  /**
   * Seconds the `url` stays valid for, measured from when this was resolved —
   * a TTL, not a timestamp. `null` when the provider gives no expiry.
   *
   * Deliberately relative: it was previously an absolute epoch second for Mux
   * and seconds-remaining for Synthesia under the same name and type, and a
   * relative value is also immune to client clock skew (the consumer pairs it
   * with the time it received the response).
   */
  expiresInSeconds: number | null;
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
    let token: string;
    try {
      token = await mux.jwt.signPlaybackId(ref, {
        keyId,
        keySecret: privateKey,
        expiration: `${MUX_TTL_SECONDS}s`,
        type: 'video',
      });
    } catch (error) {
      // Signing is local, so this only fails when the stored key itself is
      // unusable (malformed or truncated) — the admin must replace it.
      //
      // NOTE: a *revoked but well-formed* Mux key signs perfectly happily here.
      // Mux only rejects the JWT when the browser fetches the manifest, so that
      // case is detected client-side by VideoPreview's `onForbidden`, not here.
      throw new PlaybackError(
        'PROVIDER_AUTH_REJECTED',
        'The stored Mux signing key could not be used to sign playback.',
        { cause: error },
      );
    }
    return {
      url: `https://stream.mux.com/${ref}.m3u8?token=${token}`,
      kind: 'hls',
      // The JWT we just minted is valid for exactly this long.
      expiresInSeconds: MUX_TTL_SECONDS,
    };
  }

  // synthesia
  const { apiKey } = synthesiaCredentialSchema.parse(creds);
  let details: Awaited<ReturnType<typeof getVideoDetails>>;
  try {
    details = await getVideoDetails(ref, apiKey);
  } catch (error) {
    throw classifySynthesiaFailure(error);
  }
  if (!isVideoAvailable(details) || !details.download) {
    throw new PlaybackError('VIDEO_NOT_AVAILABLE', 'VIDEO_NOT_AVAILABLE');
  }
  // getVideoExpiry already returns seconds-remaining. Clamp: a pre-signed URL
  // that is already past its Expires would otherwise report a negative TTL,
  // which the field's name promises it never is.
  const remaining = getVideoExpiry(details.download);
  return {
    url: details.download,
    kind: details.download.endsWith('.m3u8') ? 'hls' : 'file',
    expiresInSeconds: remaining === null ? null : Math.max(0, remaining),
  };
}

/** Turns a Synthesia API failure into the coded error the admin UI branches on. */
function classifySynthesiaFailure(error: unknown): PlaybackError {
  if (!(error instanceof SynthesiaRequestError)) {
    return new PlaybackError(
      'PROVIDER_UNAVAILABLE',
      'Could not reach Synthesia.',
      { cause: error },
    );
  }
  if (isAuthRejectionStatus(error.status)) {
    return new PlaybackError(
      'PROVIDER_AUTH_REJECTED',
      `Synthesia refused the stored API key (${error.status}).`,
      { cause: error },
    );
  }
  if (error.status === 404) {
    return new PlaybackError(
      'VIDEO_NOT_AVAILABLE',
      'Synthesia has no video with that ID.',
      { cause: error },
    );
  }
  return new PlaybackError(
    'PROVIDER_UNAVAILABLE',
    `Synthesia returned ${error.status}.`,
    { cause: error },
  );
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
