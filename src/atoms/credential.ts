import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';

import type { ProviderId } from '../lib/admin-schemas';

/**
 * Atom-family key for a single course+provider credential.
 *
 * Keyed on both ids, not just the provider: the course-edit dialog renders one
 * credential flow per provider simultaneously, and the same provider can be
 * configured differently on different courses. A provider-only key would let a
 * save error from one course leak into another's UI.
 */
export const credentialKey = (courseId: number, provider: ProviderId) =>
  `${courseId}:${provider}`;

/**
 * Message for a failed *save* attempt (validation rejected by the provider, or
 * the request itself failed). Written by the credential machine's `setSaveError`
 * action, read by the credential form's error banner. Cleared whenever the
 * admin opens or cancels the form so a stale message can't outlive its attempt.
 */
export const credentialSaveErrorAtomFamily = atomFamily((_key: string) =>
  atom<string | null>(null),
);

/**
 * Message for a credential that saved successfully but which the provider has
 * since rejected (revoked or expired key). Distinct from `credentialSaveError`
 * because it describes the *stored* key rather than an attempt, and it must
 * survive across form open/cancel — it is only cleared by a successful save.
 */
export const credentialRejectionAtomFamily = atomFamily((_key: string) =>
  atom<string | null>(null),
);
