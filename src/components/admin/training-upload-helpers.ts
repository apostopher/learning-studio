import type { UploadStatus } from './training-doc-upload-card';

/** The document identifier: the typed name if non-blank, else the file's name. */
export function resolveDocName(
  docName: string | undefined,
  fallback: string,
): string {
  const trimmed = docName?.trim();
  return trimmed ? trimmed : fallback;
}

/** Two-phase upload status derived from the two mutations' pending flags. */
export function deriveUploadStatus(
  uploadPending: boolean,
  addPending: boolean,
): UploadStatus {
  if (uploadPending) return 'uploading';
  if (addPending) return 'processing';
  return 'idle';
}
