import { createFileRoute } from '@tanstack/react-router';
import { generateLessonMaterial } from '#/ai/generate-lesson-material';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';
import { wordToHtml } from '#/lib/word-to-html.server';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Vercel serverless request bodies cap at ~4.5 MB; stay under it. */
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

function parseLessonId(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Parse an uploaded .docx into structured lesson material for admin review.
 * Does NOT persist. Exported for unit tests; the Route below wraps it.
 */
export async function parseLessonMaterialHandler(
  request: Request,
): Promise<Response> {
  let file: File | null;
  let lessonId: number | null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
    lessonId = parseLessonId(form.get('lessonId'));
  } catch {
    return Response.json(
      { error: 'Expected multipart form data.' },
      { status: 400 },
    );
  }

  if (lessonId === null) {
    return Response.json(
      { error: 'Missing or invalid lessonId' },
      { status: 400 },
    );
  }

  // Guarded on the SAME lesson, with the SAME guard, as the save this parse
  // feeds: `lessons.$lessonId.material.ts`'s POST handler. This is the exact
  // pairing — "this person can save THIS lesson" — not the approximate one
  // ("someone who could save something") the previous version of this route
  // used, which let an SME on any discipline parse a file for an "Untitled"
  // lesson only an org admin could actually save. `getDisciplineIdForLessonId`
  // resolves this lesson's discipline directly against `lessonsTable`, so a
  // missing lesson id (invalid, or since deleted) 404s here exactly as it
  // would on the save route, rather than wasting LLM budget generating
  // material for a lesson that no longer exists.
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      lookup.disciplineId,
      'update',
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
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
