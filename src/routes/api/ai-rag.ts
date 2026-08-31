import { createFileRoute } from '@tanstack/react-router';
import { del } from '@vercel/blob';
import { generateHTMLEmbeddings } from '#/ai/embeddings';
import { convertPdfToHtml, convertWordToHtml } from '#/common/html-converters';
import {
  courseExists,
  deleteDocsBySource,
  deleteDocUrls,
  getDocUrls,
  listDocsBySource,
  upsertDocUrl,
} from '#/db/docs';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import {
  aiRagDeleteSchema,
  aiRagPostSchema,
  parseCourseIdParam,
} from '#/lib/ai-rag-schemas';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Best-effort cleanup of a just-uploaded blob when ingestion fails before
 * `upsertDocUrl` records it. Never throws — a delete failure must not mask
 * the original error being reported to the caller.
 */
async function deleteOrphanedBlob(url: string): Promise<void> {
  if (!url.includes('vercel')) return;
  try {
    await del(url);
  } catch (error) {
    console.error('Failed to delete orphaned blob:', error);
  }
}

async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export async function addEmbeddingsHandler(
  request: Request,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = aiRagPostSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const courseId = input.courseId ?? null;

  if (courseId !== null && !(await courseExists(courseId))) {
    return Response.json({ error: 'Course not found' }, { status: 400 });
  }

  let sourcePath: string;
  let html: string;

  try {
    if (input.mode === 'text') {
      sourcePath = input.sourcePath;
      html = input.html;
    } else {
      const file = await fetch(input.url);
      if (!file.ok) {
        return Response.json(
          { error: 'Failed to fetch the uploaded file.' },
          { status: 400 },
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      if (input.mimeType === 'application/pdf') {
        html = await convertPdfToHtml(input.fileName, arrayBuffer);
      } else if (input.mimeType === DOCX_MIME) {
        html = await convertWordToHtml(Buffer.from(arrayBuffer));
      } else {
        return Response.json(
          { error: 'Invalid file type. Upload a .pdf or .docx file.' },
          { status: 400 },
        );
      }
      sourcePath = `file-${input.fileName}`;
    }

    const { chunks } = await generateHTMLEmbeddings({
      courseId,
      sourcePath,
      html,
    });

    if (chunks === 0) {
      if (input.mode === 'file') {
        await deleteOrphanedBlob(input.url);
      }
      return Response.json(
        { error: 'No text was extracted from the document.' },
        { status: 400 },
      );
    }

    if (input.mode === 'file') {
      await upsertDocUrl(courseId, sourcePath, input.url);
    }

    return Response.json({ success: true, sourcePath, chunks });
  } catch (error) {
    console.error('Failed to add embeddings:', error);
    if (input.mode === 'file') {
      await deleteOrphanedBlob(input.url);
    }
    return Response.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}

export async function listEmbeddingsHandler(
  request: Request,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const raw = new URL(request.url).searchParams.get('courseId');
  const courseId = parseCourseIdParam(raw);
  if (courseId === undefined) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  try {
    const docsBySource = await listDocsBySource(courseId);
    return Response.json({ docsBySource });
  } catch (error) {
    console.error('Failed to list embeddings:', error);
    return Response.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}

export async function deleteEmbeddingsHandler(
  request: Request,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = aiRagDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const courseId = parsed.data.courseId ?? null;
  const { sourcePath } = parsed.data;

  try {
    await deleteDocsBySource(courseId, sourcePath);

    const urls = await getDocUrls(courseId, sourcePath);
    const vercelUrls = urls
      .map((row) => row.url)
      .filter((url): url is string => Boolean(url?.includes('vercel')));
    await Promise.allSettled(vercelUrls.map((url) => del(url)));

    await deleteDocUrls(courseId, sourcePath);

    return Response.json({
      success: true,
      message: `Deleted embeddings for ${sourcePath}`,
    });
  } catch (error) {
    console.error('Failed to delete embeddings:', error);
    return Response.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/ai-rag')({
  server: {
    handlers: {
      POST: ({ request }) => addEmbeddingsHandler(request),
      GET: ({ request }) => listEmbeddingsHandler(request),
      DELETE: ({ request }) => deleteEmbeddingsHandler(request),
    },
  },
});
