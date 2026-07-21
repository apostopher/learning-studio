import { createFileRoute } from '@tanstack/react-router';
import { del } from '@vercel/blob';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import {
  aiRagPostSchema,
  aiRagDeleteSchema,
  parseCourseIdParam,
} from '#/lib/ai-rag-schemas';
import { generateHTMLEmbeddings } from '#/ai/embeddings';
import { convertWordToHtml, convertPdfToHtml } from '#/common/html-converters';
import {
  courseExists,
  listDocsBySource,
  deleteDocsBySource,
  getDocUrls,
  deleteDocUrls,
  upsertDocUrl,
} from '#/db/docs';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

export async function addEmbeddingsHandler(request: Request): Promise<Response> {
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

  if (input.mode === 'text') {
    sourcePath = input.sourcePath;
    html = input.html;
  } else {
    const file = await fetch(input.url);
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

  const { chunks } = await generateHTMLEmbeddings({ courseId, sourcePath, html });

  if (chunks === 0) {
    return Response.json(
      { error: 'No text was extracted from the document.' },
      { status: 400 },
    );
  }

  if (input.mode === 'file') {
    await upsertDocUrl(courseId, sourcePath, input.url);
  }

  return Response.json({ success: true, sourcePath, chunks });
}

export async function listEmbeddingsHandler(request: Request): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const raw = new URL(request.url).searchParams.get('courseId');
  const courseId = parseCourseIdParam(raw);
  if (courseId === undefined) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  const docsBySource = await listDocsBySource(courseId);
  return Response.json({ docsBySource });
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

  await deleteDocsBySource(courseId, sourcePath);

  const urls = await getDocUrls(courseId, sourcePath);
  for (const row of urls) {
    if (row.url && row.url.includes('vercel')) {
      await del(row.url);
    }
  }
  await deleteDocUrls(courseId, sourcePath);

  return Response.json({
    success: true,
    message: `Deleted embeddings for ${sourcePath}`,
  });
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
