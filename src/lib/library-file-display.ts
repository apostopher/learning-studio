/**
 * Pure display helpers for library file tiles — kept out of the components so
 * they can be tested without rendering, per the presentational-component rule
 * that they hold no logic of their own.
 */

export type FileTypeIconKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'image'
  | 'file';

/**
 * Which sprite symbol represents this file.
 *
 * MIME type is checked first and the filename only as a fallback: the imported
 * rows carry accurate `blob_files.type` values, but `blob_files.name` has the
 * extension stripped, so name-sniffing alone would classify every file as
 * generic. Both are consulted because a future admin upload could carry a
 * vague `application/octet-stream` with a meaningful filename.
 */
export function fileTypeIconKind(type: string, name: string): FileTypeIconKind {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  const ext = (...exts: string[]) => exts.some((e) => n.endsWith(e));

  if (t.includes('pdf') || ext('.pdf')) return 'pdf';
  if (
    t.includes('spreadsheet') ||
    t.includes('excel') ||
    t === 'text/csv' ||
    ext('.xlsx', '.xls', '.csv')
  ) {
    return 'excel';
  }
  if (
    t.includes('presentation') ||
    t.includes('powerpoint') ||
    ext('.pptx', '.ppt')
  ) {
    return 'powerpoint';
  }
  // After presentation/spreadsheet: the OOXML mime types all contain
  // "officedocument", so checking "document" first would claim .xlsx and .pptx
  // for Word.
  if (
    t.includes('wordprocessing') ||
    t.includes('msword') ||
    ext('.docx', '.doc')
  ) {
    return 'word';
  }
  if (
    t.startsWith('image/') ||
    ext('.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif')
  ) {
    return 'image';
  }
  return 'file';
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * A human file size. Binary units (1024), matching every OS file browser a
 * learner will compare this against.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  // Whole numbers for bytes and KB (a "1.00 KB" file reads as noise); one
  // decimal above that, where the fraction is meaningful.
  const digits = exponent <= 1 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[exponent]}`;
}
