import { createFileRoute } from '@tanstack/react-router';
import {
  getCourseSlugsForLibraryFile,
  getLibraryFileForDownload,
} from '#/db/library';
import { auth } from '#/lib/auth';
import { getLibraryForUser } from '#/lib/library.server';
import {
  contentDispositionAttachment,
  downloadFilenameFromUrl,
} from '#/lib/library-download';

/**
 * An error the learner will SEE, because this endpoint is navigated to by a
 * plain `<a>` rather than fetched (D12). `playback.ts` answers in plain text
 * because only JS reads it; here a bare "Forbidden" would be the whole page.
 */
function errorPage(status: number, heading: string, detail: string): Response {
  const body = `<!doctype html><meta charset="utf-8"><title>${heading}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;min-height:100dvh;display:grid;place-items:center;padding:2rem;background:#111;color:#eee}
  main{max-width:32rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{margin:0 0 1.5rem;color:#aaa;line-height:1.5}
  a{color:inherit}
</style>
<main><h1>${heading}</h1><p>${detail}</p><p><a href="javascript:history.back()">Go back</a></p></main>`;
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * One uniform 403 for "locked", "not enrolled", and "no such file" alike.
 *
 * Distinguishing them hands an enumeration oracle to any signed-in caller —
 * the same rule `src/routes/api/lesson/playback.ts` follows, and the reason
 * the body is byte-identical in all three cases rather than merely similar.
 */
const forbidden = () =>
  errorPage(
    403,
    "You don't have access to this file yet",
    'Files unlock as you complete the lessons they belong to.',
  );

/**
 * Stream a library file to an entitled learner.
 *
 * The bytes are PROXIED, not redirected: a 302 would put the blob URL in the
 * address bar and the network tab, and students are never to learn about the
 * storage backend (D10). The gate is re-run here rather than trusted from the
 * page render, so a tab left open after unenrolment cannot still download.
 */
export async function getLibraryDownloadHandler(
  request: Request,
  fileIdParam: string,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return errorPage(
      401,
      'Please sign in',
      'You need to be signed in to download course files.',
    );
  }

  // Number() rather than parseInt: "12abc" must not become file 12.
  const fileId = Number(fileIdParam);
  if (!Number.isInteger(fileId) || fileId <= 0) return forbidden();

  try {
    const courseSlugs = await getCourseSlugsForLibraryFile(fileId);
    if (courseSlugs.length === 0) return forbidden();

    // Re-derived from the same function the page renders from, so the two can
    // never disagree about what is unlocked.
    let allowed = false;
    for (const courseSlug of courseSlugs) {
      const result = await getLibraryForUser({
        userId: session.user.id,
        courseSlug,
      });
      if (
        result?.files.some((f) => f.id === fileId && f.lock.kind === 'open')
      ) {
        allowed = true;
        break;
      }
    }
    if (!allowed) return forbidden();

    const file = await getLibraryFileForDownload(fileId);
    if (!file) return forbidden();

    const upstream = await fetch(file.url);
    if (!upstream.ok || !upstream.body) {
      console.error(
        `Library blob fetch failed for file ${fileId}: ${upstream.status}`,
      );
      return errorPage(
        502,
        'This file is unavailable',
        'The file could not be retrieved. Please let your instructor know.',
      );
    }

    const headers = new Headers({
      'content-type': file.type,
      'content-disposition': contentDispositionAttachment(
        downloadFilenameFromUrl(file.url),
      ),
      // The response is entitlement-dependent; a shared cache holding it would
      // serve one learner's unlocked file to another.
      'cache-control': 'private, no-store',
    });
    const length = upstream.headers.get('content-length');
    if (length) headers.set('content-length', length);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error('Library download failed:', error);
    return errorPage(
      502,
      'This file is unavailable',
      'Something went wrong retrieving the file. Please try again.',
    );
  }
}

export const Route = createFileRoute('/api/library/download/$fileId')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getLibraryDownloadHandler(request, params.fileId),
    },
  },
});
