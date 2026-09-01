import { createFileRoute } from '@tanstack/react-router';
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { env } from '#/env';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { isStaffAnywhere } from '#/lib/permissions.server';

/** Image formats admins may upload (course covers, etc.). */
const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];
const DOC_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * The one prefix that separates the two kinds of upload this endpoint serves.
 * A single constant so the policy and the guard below cannot come to disagree
 * about what a given blob key is.
 */
const TRAINING_DOCS_PREFIX = 'training-docs/';

/** Upload policy (allowed mimes + size cap) selected by the blob key prefix. */
export function uploadPolicyFor(pathname: string): {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
} {
  if (pathname.startsWith(TRAINING_DOCS_PREFIX)) {
    return {
      allowedContentTypes: DOC_CONTENT_TYPES,
      maximumSizeInBytes: DOC_MAX_BYTES,
    };
  }
  return {
    allowedContentTypes: IMAGE_CONTENT_TYPES,
    maximumSizeInBytes: IMAGE_MAX_BYTES,
  };
}

/**
 * Who may mint an upload token for this key. Throws `ForbiddenError` (→ 403)
 * otherwise. Exported for its unit test; the route wires it into
 * `onBeforeGenerateToken`.
 *
 * Branches on the SAME prefix `uploadPolicyFor` switches on, because the two
 * kinds of upload are two different surfaces:
 *
 * - `training-docs/` feeds the RAG corpus, which spec §4 keeps org-level AI
 *   infrastructure alongside personas — admin only, unchanged.
 * - Every other key is course authoring: course covers, module posters, news
 *   source art. Modules are `structure` and news sources are `content`, so
 *   both new roles reach those dialogs by design — and an admin-only guard
 *   here 403'd every image they tried to attach, with no message, at the
 *   first step of authoring anything.
 *
 * Bounded on "staff anywhere" rather than on this course because a blob
 * pathname carries no course id — the same honest bound
 * `lesson-material.parse.ts` takes, for the same reason: this route persists
 * nothing to a course, it hands back a short-lived token for a key the client
 * already chose.
 *
 * That bound is wider than the roles named above, and knowingly so. Since
 * `isStaffAnywhere` began consulting `discipline_staff`, the population it
 * admits to the non-`training-docs/` branch is: admins and owners, anyone
 * holding a `course_staff` row on any course, and anyone holding a
 * `discipline_staff` row on any discipline — a discipline-scoped SME included,
 * even though `courses/`, `modules/` and `news-sources/` are not lesson
 * authoring and are not theirs to write. Tolerated rather than tightened,
 * because a token is not a write: the blob it mints is unreferenced until some
 * other route attaches it to a course, a module or a news source, and every
 * one of those routes runs its own per-course guard that an SME with no
 * standing there fails. The same over-breadth already applied to every
 * `course_staff` holder — a professor on course A could always mint a token
 * for a `courses/` key destined for course B — so this widens an existing
 * shape rather than opening a new one. Narrowing it wants a key namespace that
 * carries its own scope, which is a change to every upload call site, not to
 * this guard.
 */
export async function requireUploadAccess(
  headers: Headers,
  pathname: string,
): Promise<void> {
  if (pathname.startsWith(TRAINING_DOCS_PREFIX)) {
    await requireAdmin(headers);
    return;
  }
  if (!(await isStaffAnywhere(headers))) throw new ForbiddenError();
}

/**
 * Vercel Blob client-upload token endpoint. The browser's `upload()` helper
 * POSTs here; `handleUpload` authorizes token generation (see
 * `requireUploadAccess`) and mints a short-lived client token the browser uses
 * to upload directly to Blob storage — bypassing the serverless request-body
 * size limit.
 */
export const Route = createFileRoute('/api/admin/uploads')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: HandleUploadBody;
        try {
          body = (await request.json()) as HandleUploadBody;
        } catch {
          console.error('Invalid JSON body');
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        try {
          const result = await handleUpload({
            body,
            request,
            token: env.BLOB_READ_WRITE_TOKEN,
            onBeforeGenerateToken: async (pathname) => {
              // Only runs for the token-generation event. The guard throws
              // ForbiddenError (→ 403 below) when the caller may not upload
              // under this key. The separate upload-completed webhook is
              // authenticated by Blob's own token signature, so it isn't
              // guarded here.
              await requireUploadAccess(request.headers, pathname);
              // The client sends a unique UUID pathname per upload, so no random
              // suffix is needed — names stay clean (courses/<uuid>.<ext>).
              const policy = uploadPolicyFor(pathname);
              return {
                allowedContentTypes: policy.allowedContentTypes,
                maximumSizeInBytes: policy.maximumSizeInBytes,
                addRandomSuffix: false,
              };
            },
          });
          return Response.json(result);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return new Response('Forbidden', { status: 403 });
          }
          // handleUpload throws on malformed bodies, invalid/expired client
          // tokens, or webhook signature failures — surface as a 400.
          return Response.json(
            { error: (error as Error).message },
            { status: 400 },
          );
        }
      },
    },
  },
});
