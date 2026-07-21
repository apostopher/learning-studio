import { describe, expect, it } from 'vitest';
import {
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
