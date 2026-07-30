/**
 * One-time repair for the second bug in the first `import-course.ts` run:
 * blob pathnames were double-encoded.
 *
 * `new URL(url).pathname` returns the PERCENT-ENCODED path
 * (`/library-%21CANDA-SITE%20SURVEY%20CHECKLIST%20v1.21.pdf`). `put()` then
 * encodes whatever string it is handed, so `%21` became `%2521` and `%20`
 * became `%2520`. The blobs are all reachable — but their real names contain the
 * escape sequences as literal characters, so downloading one saves a file called
 * `%21CANDA-SITE%20SURVEY%20CHECKLIST%20v1.21.pdf` rather than
 * `!CANDA-SITE SURVEY CHECKLIST v1.21.pdf`.
 *
 * `import-course.ts` now decodes before uploading. This repairs the rows already
 * written: re-upload each affected file under its true pathname (matching the
 * source store exactly), repoint `blob_files.url`, and delete the
 * wrongly-named blob so the store is not left with two copies of everything.
 *
 * `blob_files.name` is deliberately NOT touched. It is copied faithfully from
 * the source, where it is already inconsistent (one row stores
 * `Brain%20Visual%20Processing.pdf` with escapes, another stores
 * `!CANDA-SITE SURVEY CHECKLIST v1.21` with no extension at all). Cleaning that
 * up is a content decision, not part of fixing storage.
 *
 * Idempotent: files already stored under the correct pathname are skipped.
 */
import { del, put } from '@vercel/blob';
import { Pool } from 'pg';

const UPLOADED_BY = 'import:itps-uas-remote';
const newDb = new Pool({ connectionString: process.env.DATABASE_URL });
const newQ = async <T = Record<string, unknown>>(s: string, p: unknown[] = []) =>
  (await newDb.query(s, p)).rows as T[];

/** True when a pathname still contains an encoded escape, i.e. `%25xx`. */
const isDoubleEncoded = (url: string) => /%25[0-9A-Fa-f]{2}/.test(url);

async function main() {
  const files = await newQ<{
    id: number;
    url: string;
    type: string;
  }>(
    `select id, url, type from blob_files where "uploadedBy" = $1 order by id`,
    [UPLOADED_BY],
  );
  console.log(`files: ${files.length}`);

  let fixed = 0;
  let ok = 0;
  for (const f of files) {
    if (!isDoubleEncoded(f.url)) {
      ok++;
      continue;
    }
    const wrongUrl = f.url;
    // One decode undoes put()'s encoding, leaving the source store's encoded
    // form; a second gives the true pathname.
    const truePathname = decodeURIComponent(
      decodeURIComponent(new URL(wrongUrl).pathname.replace(/^\//, '')),
    );

    const res = await fetch(wrongUrl);
    if (!res.ok) throw new Error(`GET ${wrongUrl} -> ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());

    const uploaded = await put(truePathname, body, {
      access: 'public',
      contentType: f.type,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    await newQ(`update blob_files set url = $2 where id = $1`, [
      f.id,
      uploaded.url,
    ]);
    // Only after the new copy is recorded, so a crash mid-repair never leaves a
    // row pointing at a deleted blob.
    await del(wrongUrl);
    fixed++;
    if (fixed % 10 === 0) console.log(`  …${fixed} re-stored`);
  }

  console.log(`\nalready correct: ${ok}`);
  console.log(`re-stored:       ${fixed}`);

  const remaining = await newQ<{ url: string }>(
    `select url from blob_files where "uploadedBy" = $1 and url ~ '%25[0-9A-Fa-f]{2}'`,
    [UPLOADED_BY],
  );
  console.log(`still double-encoded: ${remaining.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('REPAIR FAILED:', e);
  process.exit(1);
});
