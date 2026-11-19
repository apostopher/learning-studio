import { createFileRoute } from '@tanstack/react-router';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
} from 'ai';
import { buildChatStream } from '#/ai/chat';
import { makePreviewSearchKBTool } from '#/ai/tools/search-kb';
import { lessonExistsBySlug } from '#/db/lesson';
import { getPersonaById } from '#/db/persona';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { previewChatRequestSchema } from '#/lib/viper-preview-schemas';

/** Returns the userId of an admin, or the 403 to send instead. */
async function guard(
  request: Request,
): Promise<{ userId: string } | { denied: Response }> {
  try {
    const { userId } = await requireAdmin(request.headers);
    return { userId };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { denied: new Response('Forbidden', { status: 403 }) };
    }
    throw error;
  }
}

/**
 * The AI Training tab's preview chat: an admin talks to Viper as a learner
 * would, scoped to one lesson, with a chosen persona — its unpublished draft
 * when it has one, so edits can be tried before they go live.
 *
 * Deliberately NOT the student chat:
 * - Nothing is saved. No chat row, no messages, no summary or compaction; the
 *   client holds the conversation and sends it whole (at most
 *   `PREVIEW_MAX_MESSAGES`).
 * - Nothing about the admin personalises the prompt: a placeholder learner,
 *   no subscriptions, no SKA profile, debrief gaps or open questions, and no
 *   course.
 * - Search uses `makePreviewSearchKBTool`, which skips lesson gating. That is
 *   why the admin guard runs before anything else.
 */
export async function previewChatHandler(request: Request): Promise<Response> {
  const admin = await guard(request);
  if ('denied' in admin) return admin.denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = previewChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { personaId, lessonSlug } = parsed.data;

  // The schema bounds the count; this checks each entry is a UI message the
  // model conversion can read, so a malformed one is a 400, not a broken stream.
  const validated = await safeValidateUIMessages({
    messages: parsed.data.messages,
  });
  if (!validated.success) {
    return Response.json({ error: validated.error.message }, { status: 400 });
  }
  const messages = validated.data;

  // Org-scoped read: a persona id from another org comes back null.
  const persona = await getPersonaById(getActiveOrgId(), personaId);
  if (!persona) {
    return Response.json({ error: 'Persona not found' }, { status: 404 });
  }

  if (!(await lessonExistsBySlug(lessonSlug))) {
    return Response.json({ error: 'Lesson not found' }, { status: 404 });
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // See chat.ts: the real writer is a structural superset of the loosened
      // `{ write }` type both of these accept.
      const looseWriter = writer as unknown as { write: (p: unknown) => void };
      const result = await buildChatStream({
        messages,
        uiMessages: messages,
        // The draft is what the admin is testing; fall back to published.
        persona: persona.draftContent ?? persona.content,
        userInfo: { name: 'Preview learner', callSign: '', location: '' },
        subscriptions: [],
        userId: admin.userId,
        searchKBTool: makePreviewSearchKBTool({
          lessonSlug,
          writer: looseWriter,
        }),
        writer: looseWriter,
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export const Route = createFileRoute('/api/admin/viper/preview')({
  server: {
    handlers: {
      POST: ({ request }) => previewChatHandler(request),
    },
  },
});
