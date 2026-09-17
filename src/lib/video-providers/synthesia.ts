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
      // Share links keep the id in the path; the editor
      // (app.synthesia.io/#/video-edit/<id>) is a hash router, so there it
      // sits in the fragment. Tested separately — joining the two made a
      // share link with any fragment fail.
      const lastSegment = (s: string) => s.split('/').filter(Boolean).at(-1);
      const fromPath = lastSegment(u.pathname);
      if (fromPath && UUID_RE.test(fromPath)) return { ref: fromPath };
      const fromHash = lastSegment(u.hash);
      return fromHash && UUID_RE.test(fromHash) ? { ref: fromHash } : null;
    } catch {
      return null;
    }
  },
  toUrl(ref) {
    return `https://share.synthesia.io/${ref}`;
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
