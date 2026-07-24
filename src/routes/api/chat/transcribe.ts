import { createFileRoute } from '@tanstack/react-router';
import { generateText } from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import { auth } from '#/lib/auth';

// Gemini accepts inline audio well within this; the client also caps recordings
// at 90s, so real payloads are a few hundred KB.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const TRANSCRIBE_PROMPT =
  'Transcribe the speech in this audio verbatim. Return only the transcript ' +
  'text with no additional commentary, labels, or quotation marks. If there ' +
  'is no discernible speech, return an empty string.';

/**
 * Voice-transcription endpoint for the chat widget: authenticates, reads the
 * `audio` field off the posted FormData, and hands the raw bytes to
 * `geminiFlash` (multimodal — Google has no dedicated transcription
 * endpoint) as a file part alongside `TRANSCRIBE_PROMPT`.
 */
export async function transcribeHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio = formData.get('audio');
  if (!(audio instanceof Blob)) {
    return Response.json({ error: 'Missing audio field' }, { status: 400 });
  }
  if (audio.size === 0) {
    return Response.json({ error: 'Empty audio' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: 'Audio exceeds 20MB limit' },
      { status: 400 },
    );
  }

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const { text } = await generateText({
      model: geminiFlash,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: TRANSCRIBE_PROMPT },
            {
              type: 'file',
              data: bytes,
              mediaType: audio.type || 'audio/webm',
            },
          ],
        },
      ],
    });
    return Response.json({ transcript: text.trim() });
  } catch (error) {
    console.error('[/api/chat/transcribe] transcription failed', error);
    return Response.json({ error: 'Transcription failed' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/chat/transcribe')({
  server: {
    handlers: {
      POST: ({ request }) => transcribeHandler(request),
    },
  },
});
