import type { UseFormReturn } from 'react-hook-form';

import type { ProviderId } from '#/lib/video-providers';
import type { CredentialField } from './provider-credential-form';

/** Superset of every provider's credential fields — RHF only registers the ones a given provider actually renders. */
export interface CredentialFormValues {
  keyId?: string;
  privateKey?: string;
  apiKey?: string;
}

/**
 * Builds the input descriptors for a provider's credential form.
 *
 * Call this on **every render** — never inside `useMemo`. `form` is a stable
 * reference, so a memo keyed on it would never recompute after
 * `form.setError`, leaving field validation messages stuck at `undefined`.
 */
export function buildCredentialFields(
  provider: ProviderId,
  form: UseFormReturn<CredentialFormValues>,
): CredentialField[] {
  if (provider === 'mux') {
    return [
      {
        name: 'keyId',
        label: 'Signing key ID',
        type: 'text',
        register: form.register('keyId'),
        error: form.formState.errors.keyId?.message,
      },
      {
        name: 'privateKey',
        label: 'Signing key (private, Base64)',
        type: 'password',
        register: form.register('privateKey'),
        error: form.formState.errors.privateKey?.message,
      },
    ];
  }
  if (provider === 'synthesia') {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        register: form.register('apiKey'),
        error: form.formState.errors.apiKey?.message,
      },
    ];
  }
  return [];
}
