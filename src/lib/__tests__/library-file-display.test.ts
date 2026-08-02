import { describe, expect, it } from 'vitest';
import { fileTypeIconKind, formatFileSize } from '#/lib/library-file-display';

describe('fileTypeIconKind', () => {
  // The five MIME types actually present in the imported data.
  it.each([
    ['application/pdf', 'pdf'],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'excel',
    ],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'word',
    ],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'powerpoint',
    ],
    ['image/png', 'image'],
  ])('maps %s to the %s icon', (type, expected) => {
    expect(fileTypeIconKind(type, 'whatever')).toBe(expected);
  });

  /**
   * Every OOXML mime contains "officedocument", so a naive `includes('document')`
   * check ordered before the spreadsheet/presentation checks claims .xlsx and
   * .pptx for Word.
   */
  it('does not claim spreadsheets or decks for Word', () => {
    expect(
      fileTypeIconKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'x',
      ),
    ).not.toBe('word');
    expect(
      fileTypeIconKind(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'x',
      ),
    ).not.toBe('word');
  });

  it('falls back to the filename when the mime type is vague', () => {
    expect(fileTypeIconKind('application/octet-stream', 'report.pdf')).toBe(
      'pdf',
    );
    expect(fileTypeIconKind('application/octet-stream', 'data.CSV')).toBe(
      'excel',
    );
  });

  it('returns the generic icon for anything unrecognised', () => {
    expect(fileTypeIconKind('application/zip', 'bundle.zip')).toBe('file');
  });

  /**
   * Imported names have their extension stripped, so name-sniffing alone must
   * never be the only signal — the mime type has to carry these.
   */
  it('classifies an extensionless name by mime type alone', () => {
    expect(fileTypeIconKind('application/pdf', '!AirmanshipBkgnd444Sqn')).toBe(
      'pdf',
    );
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [10466, '10 KB'],
    [291360, '285 KB'],
    [2819338, '2.7 MB'],
    [28870212, '27.5 MB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it('shows no decimals for bytes and KB, where a fraction is noise', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('shows one decimal from MB up, where the fraction is meaningful', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('does not run off the end of the unit list', () => {
    expect(formatFileSize(1024 ** 5)).toContain('GB');
  });

  it('treats nonsense sizes as zero rather than rendering NaN', () => {
    expect(formatFileSize(Number.NaN)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
  });
});
