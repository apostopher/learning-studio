import { createFileRoute } from '@tanstack/react-router';
import { generateLessonMaterial } from '#/ai/generate-lesson-material';
import { auth } from '#/lib/auth';
import { canParseLessonMaterial } from '#/lib/permissions.server';
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
  // Guarded on being someone who could go on to SAVE the result: an SME on
  // any discipline, or an org admin.
  //
  // This route takes a .docx and returns generated material. It persists
  // nothing and receives no lesson id of any kind — only a multipart file —
  // so there is no discipline to scope by, and `requireLessonContentPermission`
  // has nothing to resolve against. `canParseLessonMaterial` is the
  // course-less counterpart: an SME holding `content:create` on some
  // discipline (mirrors the "is staff somewhere" bound this route used
  // before discipline-scoping existed), OR'd with the org-admin fallback
  // that saving to an "Untitled" (no-discipline) lesson requires — an admin
  // holds no `content` grant of their own, but is still the one who may save
  // material onto a lesson with no SME to ask.
  //
  // The grant, not merely "is staff somewhere": a course manager holds
  // `content:read` only, and would otherwise burn LLM budget generating
  // material that `lessons.$lessonId.material.ts` — which requires
  // `content:update` via the same discipline/admin split — would refuse to
  // save.
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return new Response('Forbidden', { status: 403 });

  if (!(await canParseLessonMaterial(userId))) {
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
