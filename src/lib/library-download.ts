/**
 * Filename and Content-Disposition construction for library downloads. Pure,
 * so the encoding rules are testable without a request.
 */

/**
 * The name to save a library file as, derived from its blob pathname.
 *
 * NOT from `blob_files.name`, which drops the extension — the import script
 * calls this out: `!CANDA-SITE SURVEY CHECKLIST v1.21` exists twice, once as a
 * PDF and once as a spreadsheet, under one stored name. Saving by that name
 * would give a learner two extensionless files their OS cannot open.
 *
 * The pathname is percent-encoded (`put()` encoded whatever it was given), so
 * it is decoded back to the real name, and the `library-` prefix — an
 * implementation detail of how the old platform marked library membership — is
 * stripped so downloads land as "!CANDA-SITE SURVEY CHECKLIST v1.21.pdf".
 */
export function downloadFilenameFromUrl(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return 'download';
  }
  const base = pathname.slice(pathname.lastIndexOf('/') + 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    // A malformed escape sequence throws; the encoded form is still a usable
    // filename and is better than failing the download over cosmetics.
    decoded = base;
  }
  const stripped = decoded.startsWith('library-')
    ? decoded.slice('library-'.length)
    : decoded;
  return stripped.length > 0 ? stripped : 'download';
}

/**
 * An RFC 6266 / RFC 5987 attachment header.
 *
 * Both forms are emitted: `filename=` with an ASCII-safe fallback, and
 * `filename*=UTF-8''…` with the real name. Library filenames contain spaces,
 * `!`, and non-ASCII characters, all of which break the bare `filename=` form
 * — a quoted string cannot carry them, and clients that see only the fallback
 * still get something sane rather than a truncated name.
 */
export function contentDispositionAttachment(filename: string): string {
  // Quotes and backslashes would terminate or escape the quoted-string; other
  // non-ASCII and control characters are replaced rather than dropped so the
  // fallback keeps roughly the same shape as the real name.
  const ascii = filename
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point — they would corrupt the header
    .replace(/[\u0000-\u001f\u007f-\uffff]/g, '_')
    .replace(/["\\]/g, '_');
  const fallback = ascii.length > 0 ? ascii : 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    filename,
  )}`;
}
