import { createFileRoute } from '@tanstack/react-router';
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { env } from '@/env';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';

/** Image formats admins may upload (course covers, etc.). */
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Vercel Blob client-upload token endpoint. The browser's `upload()` helper
 * POSTs here; `handleUpload` authorizes token generation (admin only) and mints
 * a short-lived client token the browser uses to upload directly to Blob
 * storage — bypassing the serverless request-body size limit.
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
            onBeforeGenerateToken: async () => {
              // Only runs for the token-generation event. requireAdmin throws
              // ForbiddenError (→ 403 below) when the caller isn't an admin.
              // The separate upload-completed webhook is authenticated by
              // Blob's own token signature, so it isn't guarded here.
              await requireAdmin(request.headers);
              // The client sends a unique UUID pathname per upload, so no random
              // suffix is needed — names stay clean (courses/<uuid>.<ext>).
              return {
                allowedContentTypes: ALLOWED_CONTENT_TYPES,
                maximumSizeInBytes: MAX_SIZE_BYTES,
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
