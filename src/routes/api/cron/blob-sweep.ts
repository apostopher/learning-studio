import { createFileRoute } from '@tanstack/react-router';
import { sweepOrphanBlobs } from '@/db/admin';
import { env } from '@/env';

/**
 * Vercel Cron endpoint: sweep orphaned cover blobs (uploaded but never saved).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set;
 * the endpoint stays disabled (401) until it is configured.
 */
export const Route = createFileRoute('/api/cron/blob-sweep')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get('authorization');
        if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
          return new Response('Unauthorized', { status: 401 });
        }
        const result = await sweepOrphanBlobs();
        return Response.json(result);
      },
    },
  },
});
