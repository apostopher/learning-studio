import { describe, expect, it } from 'vitest';
import {
  canonicalMimeType,
  deriveUploadStatus,
  resolveDocName,
} from '#/components/admin/training-upload-helpers';

describe('resolveDocName', () => {
  it('uses the trimmed doc name when one is provided', () => {
    expect(resolveDocName('  My Doc  ', 'file.pdf')).toBe('My Doc');
  });
  it('falls back to the file name when blank or undefined', () => {
    expect(resolveDocName('', 'file.pdf')).toBe('file.pdf');
    expect(resolveDocName('   ', 'file.pdf')).toBe('file.pdf');
    expect(resolveDocName(undefined, 'file.pdf')).toBe('file.pdf');
  });
});

describe('deriveUploadStatus', () => {
  it('is uploading while the blob upload is pending', () => {
    expect(deriveUploadStatus(true, false)).toBe('uploading');
  });
  it('is processing while the embed request is pending', () => {
    expect(deriveUploadStatus(false, true)).toBe('processing');
  });
  it('is idle when nothing is pending', () => {
    expect(deriveUploadStatus(false, false)).toBe('idle');
  });
});

describe('canonicalMimeType', () => {
  it('trusts a known pdf file.type', () => {
    expect(canonicalMimeType('doc.pdf', 'application/pdf')).toBe(
      'application/pdf',
    );
  });
  it('trusts a known docx file.type', () => {
    expect(
      canonicalMimeType(
        'doc.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });
  it('derives pdf from extension when file.type is empty', () => {
    expect(canonicalMimeType('doc.pdf', '')).toBe('application/pdf');
  });
  it('derives docx from extension when file.type is empty', () => {
    expect(canonicalMimeType('doc.docx', '')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });
  it('returns the input type unchanged for unknown type and extension', () => {
    expect(canonicalMimeType('doc.txt', 'text/plain')).toBe('text/plain');
  });
});
