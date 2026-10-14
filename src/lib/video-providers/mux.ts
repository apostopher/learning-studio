import { z } from 'zod';
import type { VideoProviderMeta } from './types';

// Mux playback ids are url-safe base64-ish strings, no dots/slashes.
const PLAYBACK_ID_RE = /^[A-Za-z0-9]+$/;

/** Blank inputs from an untouched optional form field are "absent". */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().min(1).optional(),
);

/** Field shape, unrefined, so the API input schema can spread it into a discriminated union. */
export const muxCredentialShape = {
  keyId: z.string().trim().min(1, 'Signing key ID is required'),
  // Base64 PEM private key from the Mux signing key.
  privateKey: z.string().trim().min(1, 'Signing key (private) is required'),
  // Optional Mux API access token (Video read/write): only needed to generate
  // captions. Playback signing never uses it.
  apiTokenId: optionalSecret,
  apiTokenSecret: optionalSecret,
};

export const muxCredentialSchema = z
  .object(muxCredentialShape)
  .refine(
    (c) => (c.apiTokenId === undefined) === (c.apiTokenSecret === undefined),
    {
      message: 'Enter both the API token ID and secret, or neither',
      path: ['apiTokenSecret'],
    },
  );
export type MuxCredentials = z.infer<typeof muxCredentialSchema>;

/**
 * Re-saving Mux credentials re-enters the signing key (it is never shown
 * back), but the token fields are optional — so an admin updating the key
 * would otherwise silently drop a stored token and switch captions off. An
 * entered token always wins; with none entered, the stored one is kept.
 */
export function mergeStoredMuxToken(
  input: MuxCredentials,
  stored: unknown,
): MuxCredentials {
  if (input.apiTokenId !== undefined) return input;
  const prev = muxCredentialSchema.safeParse(stored);
  if (!prev.success || prev.data.apiTokenId === undefined) return input;
  return {
    ...input,
    apiTokenId: prev.data.apiTokenId,
    apiTokenSecret: prev.data.apiTokenSecret,
  };
}

export const muxProvider: VideoProviderMeta = {
  id: 'mux',
  label: 'Mux',
  detect(url) {
    const raw = url.trim();
    if (PLAYBACK_ID_RE.test(raw)) return { ref: raw };
    try {
      const u = new URL(raw);
      if (u.hostname !== 'stream.mux.com') return null;
      const seg = u.pathname.split('/').filter(Boolean).at(-1);
      if (!seg) return null;
      const ref = seg.replace(/\.[a-z0-9]+$/i, ''); // strip .m3u8 / .mp4
      return PLAYBACK_ID_RE.test(ref) ? { ref } : null;
    } catch {
      return null;
    }
  },
  toUrl(ref) {
    return `https://stream.mux.com/${ref}.m3u8`;
  },
  credentialSchema: muxCredentialSchema,
  credentialDisplay(creds) {
    const { keyId, apiTokenId } = muxCredentialSchema.parse(creds);
    return apiTokenId ? { keyId, apiTokenId } : { keyId };
  },
  howTo: {
    title: 'Connect Mux',
    steps: [
      'In Mux → Settings → Signing Keys, create a signing key.',
      'Copy the Key ID and the Base64 private key.',
      'Ensure your videos use a "signed" playback policy.',
      'Optional, for captions: in Mux → Settings → Access Tokens, create a token with Mux Video read and write, and paste its ID and secret.',
      'Paste both below — stored encrypted, used server-side to sign short-lived playback tokens.',
    ],
  },
};
