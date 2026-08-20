import { createFileRoute } from '@tanstack/react-router';
import { generateLessonMaterial } from '#/ai/generate-lesson-material';
import { isAnyCourseStaff } from '#/db/course-staff';
import { getUserRoleNames } from '#/db/user-roles';
import { hasAdminAccess } from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';
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
  // Guarded on being staff ANYWHERE rather than on a specific course.
  //
  // This route takes a .docx and returns generated material. It persists
  // nothing and receives no course, module or lesson id of any kind — only a
  // multipart file. Course-scoping it would mean inventing an identifier the
  // client does not have, to protect a write that never happens. So the
  // check is admin-or-owner, or holding any `course_staff` row at all —
  // not `requireCoursePermission`, which needs a course id this route
  // doesn't have.
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return new Response('Forbidden', { status: 403 });

  const roles = await getUserRoleNames(userId);
  const allowed = hasAdminAccess(roles) || (await isAnyCourseStaff(userId));
  if (!allowed) return new Response('Forbidden', { status: 403 });

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
