import { describe, expect, it } from 'vitest';
import {
  contentDispositionAttachment,
  downloadFilenameFromUrl,
} from '#/lib/library-download';

const BLOB = 'https://x.public.blob.vercel-storage.com';

describe('downloadFilenameFromUrl', () => {
  it('strips the library- prefix so the saved name is the real one', () => {
    expect(downloadFilenameFromUrl(`${BLOB}/library-Bookaminute.pdf`)).toBe(
      'Bookaminute.pdf',
    );
  });

  /**
   * `blob_files.name` drops the extension, which is why the filename comes
   * from the pathname: two real rows share the name "!CANDA-SITE SURVEY
   * CHECKLIST v1.21", one a PDF and one a spreadsheet.
   */
  it('keeps the extension the stored name does not have', () => {
    expect(
      downloadFilenameFromUrl(`${BLOB}/library-%21CANDA%20CHECKLIST.xlsx`),
    ).toBe('!CANDA CHECKLIST.xlsx');
  });

  it('decodes percent-encoded spaces and punctuation', () => {
    expect(
      downloadFilenameFromUrl(`${BLOB}/library-%21AirmanshipBkgnd444Sqn.pdf`),
    ).toBe('!AirmanshipBkgnd444Sqn.pdf');
  });

  it('leaves a name that has no library- prefix alone', () => {
    expect(downloadFilenameFromUrl(`${BLOB}/other-thing.pdf`)).toBe(
      'other-thing.pdf',
    );
  });

  it('falls back rather than throwing on a malformed URL', () => {
    expect(downloadFilenameFromUrl('not a url')).toBe('download');
  });

  it('falls back rather than throwing on a broken escape sequence', () => {
    expect(downloadFilenameFromUrl(`${BLOB}/library-%E0%A4%A.pdf`)).toBe(
      '%E0%A4%A.pdf',
    );
  });

  it('falls back when the pathname is empty', () => {
    expect(downloadFilenameFromUrl(`${BLOB}/library-`)).toBe('download');
  });
});

describe('contentDispositionAttachment', () => {
  it('emits both the ASCII fallback and the UTF-8 form', () => {
    expect(contentDispositionAttachment('Bookaminute.pdf')).toBe(
      `attachment; filename="Bookaminute.pdf"; filename*=UTF-8''Bookaminute.pdf`,
    );
  });

  it('percent-encodes spaces in the UTF-8 form', () => {
    expect(contentDispositionAttachment('AQ 101.pdf')).toContain(
      "filename*=UTF-8''AQ%20101.pdf",
    );
  });

  it('neutralises quotes so they cannot terminate the quoted string', () => {
    const header = contentDispositionAttachment('a"b.pdf');
    expect(header).toContain('filename="a_b.pdf"');
    // The real name survives intact in the encoded form.
    expect(header).toContain("filename*=UTF-8''a%22b.pdf");
  });

  it('neutralises backslashes, which would escape the next character', () => {
    expect(contentDispositionAttachment('a\\b.pdf')).toContain(
      'filename="a_b.pdf"',
    );
  });

  it('strips CR/LF so a filename cannot inject a header', () => {
    const header = contentDispositionAttachment('a\r\nX-Evil: 1.pdf');
    expect(header).not.toMatch(/[\r\n]/);
  });

  it('replaces non-ASCII in the fallback but keeps it in the encoded form', () => {
    const header = contentDispositionAttachment('café.pdf');
    expect(header).toContain('filename="caf_.pdf"');
    expect(header).toContain("filename*=UTF-8''caf%C3%A9.pdf");
  });

  it('never emits an empty fallback filename', () => {
    expect(contentDispositionAttachment('é')).toContain('filename="_"');
  });
});
