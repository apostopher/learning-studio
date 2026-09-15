import type { z } from 'zod';

export type ProviderId = 'mux' | 'synthesia';

export interface VideoProviderMeta {
  id: ProviderId;
  label: string;
  /** Detect this provider and extract the normalized ref, or null. */
  detect(url: string): { ref: string } | null;
  /**
   * The canonical URL for a stored ref — what the video field is prefilled
   * with so an admin sees what is attached. Must round-trip through this
   * provider's own `detect`, or the field would open on a value the form
   * calls unsupported.
   */
  toUrl(ref: string): string;
  /** Zod schema for the credential fields the admin enters. */
  credentialSchema: z.ZodType;
  /** Non-secret projection for display. Never returns the secret itself. */
  credentialDisplay(creds: unknown): Record<string, unknown>;
  howTo: { title: string; steps: string[] };
}
