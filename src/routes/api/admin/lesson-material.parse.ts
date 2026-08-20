import { createFileRoute } from '@tanstack/react-router';
import { generateLessonMaterial } from '#/ai/generate-lesson-material';
import { auth } from '#/lib/auth';
import { hasCoursePermissionAnywhere } from '#/lib/permissions.server';
import { wordToHtml } from '#/lib/word-to-html.server';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Vercel serverless request bodies cap at ~4.5 MB; stay under it. */
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * Parse an uploaded .docx into structured lesson material for admin review.
 * Does NOT persist. Exported for unit tests; the Route below wraps it.
 */
export async function parseLessonMaterialHandler(
  request: Request,
): Promise<Response> {
  // Guarded on holding `content:create` on ANY course (spec §9b.2).
  //
  // This route takes a .docx and returns generated material. It persists
  // nothing and receives no course, module or lesson id of any kind — only a
  // multipart file, so `requireCoursePermission` has no course id to work
  // with and course-scoping it would mean inventing an identifier the client
  // does not have.
  //
  // The grant, not merely "is staff somewhere": a course manager holds
  // `content:read` only and an admin by design holds no `content` grant at
  // all, and both would otherwise burn LLM budget generating material that
  // `lessons.$lessonId.material.ts` — which correctly requires
  // `content:update` — would refuse to save.
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return new Response('Forbidden', { status: 403 });

  if (!(await hasCoursePermissionAnywhere(userId, 'content', 'create'))) {
    return new Response('Forbidden', { status: 403 });
  }

  let file: File | null;
  try {
    const value = (await request.formData()).get('file');
    file = value instanceof File ? value : null;
  } catch {
    return Response.json(
      { error: 'Expected multipart form data.' },
      { status: 400 },
    );
  }

  if (!file || file.type !== DOCX_MIME) {
    return Response.json(
      { error: 'Please upload a .docx Word document.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json(
      { error: 'File too large. Maximum size is 4 MB.' },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const html = await wordToHtml(buffer);
    const material = await generateLessonMaterial(html);
    return Response.json(material);
  } catch (error) {
    console.error('Failed to parse lesson material:', error);
    return Response.json(
      { error: 'Failed to parse the document. Please try again.' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/admin/lesson-material/parse')({
  server: {
    handlers: { POST: ({ request }) => parseLessonMaterialHandler(request) },
  },
});
