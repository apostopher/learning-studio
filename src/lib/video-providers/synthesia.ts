import { z } from 'zod';
import type { VideoProviderMeta } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const synthesiaCredentialSchema = z.object({
  apiKey: z.string().trim().min(1, 'API key is required'),
});

export const synthesiaProvider: VideoProviderMeta = {
  id: 'synthesia',
  label: 'Synthesia',
  detect(url) {
    if (UUID_RE.test(url.trim())) return { ref: url.trim() };
    try {
      const u = new URL(url);
      if (!/(^|\.)synthesia\.io$/.test(u.hostname)) return null;
      const seg = u.pathname.split('/').filter(Boolean).at(-1);
      return seg && UUID_RE.test(seg) ? { ref: seg } : null;
    } catch {
      return null;
    }
  },
  credentialSchema: synthesiaCredentialSchema,
  credentialDisplay(creds) {
    const { apiKey } = synthesiaCredentialSchema.parse(creds);
    return { apiKeyLast4: apiKey.slice(-4) };
  },
  howTo: {
    title: 'Connect Synthesia',
    steps: [
      'Open Synthesia → Settings → Integrations → API.',
      'Create (or copy) an API key.',
      'Paste it below. It is stored encrypted and only used server-side to fetch playback URLs.',
    ],
  },
};
