import { z } from 'zod';
import type { VideoProviderMeta } from './types';

// Mux playback ids are url-safe base64-ish strings, no dots/slashes.
const PLAYBACK_ID_RE = /^[A-Za-z0-9]+$/;

export const muxCredentialSchema = z.object({
  keyId: z.string().trim().min(1, 'Signing key ID is required'),
  // Base64 PEM private key from the Mux signing key.
  privateKey: z.string().trim().min(1, 'Signing key (private) is required'),
});

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
  credentialSchema: muxCredentialSchema,
  credentialDisplay(creds) {
    const { keyId } = muxCredentialSchema.parse(creds);
    return { keyId };
  },
  howTo: {
    title: 'Connect Mux',
    steps: [
      'In Mux → Settings → Signing Keys, create a signing key.',
      'Copy the Key ID and the Base64 private key.',
      'Ensure your videos use a "signed" playback policy.',
      'Paste both below — stored encrypted, used server-side to sign short-lived playback tokens.',
    ],
  },
};
