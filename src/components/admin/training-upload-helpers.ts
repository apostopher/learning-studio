import type { UploadStatus } from './training-doc-upload-card';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Canonical upload mime: trust a known file.type, else derive from extension. */
export function canonicalMimeType(fileName: string, fileType: string): string {
  if (fileType === PDF_MIME || fileType === DOCX_MIME) return fileType;
  if (/\.pdf$/i.test(fileName)) return PDF_MIME;
  if (/\.docx$/i.test(fileName)) return DOCX_MIME;
  return fileType;
}

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
