import { useChat } from '@ai-sdk/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { useStickToBottom } from 'use-stick-to-bottom';
import { z } from 'zod';
import { previewLessonSlugAtom, previewPersonaIdAtom } from '#/atoms/admin';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import { usePersonas } from '#/data-hooks/use-personas';
import { flattenLibraryLessons } from '#/lib/library-lessons';
import { PREVIEW_MAX_MESSAGES } from '#/lib/viper-preview-schemas';
import { AIWriterDataNotificationSchema } from '#/types';
import { PreviewChat, type PreviewChatItem } from './preview-chat';

const composerSchema = z.object({ text: z.string().trim().min(1) });
type ComposerForm = z.infer<typeof composerSchema>;

/** The transcript as rows: text parts and status lines; other parts skipped. */
export function toPreviewItems(messages: UIMessage[]): PreviewChatItem[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part, index): PreviewChatItem[] => {
      const key = `${message.id}-${index}`;
      if (part.type === 'text') {
        return message.role === 'system'
          ? []
          : [{ key, kind: 'text', role: message.role, text: part.text }];
      }
      const notification = AIWriterDataNotificationSchema.safeParse(part);
      return notification.success
        ? [{ key, kind: 'notification', text: notification.data.data.text }]
        : [];
    }),
  );
}

/**
 * The transport surfaces a failed response as an Error whose message is the
 * body text — for this route, `{"error":"Lesson not found"}`. Show the
 * sentence, not the JSON.
 */
export function previewErrorMessage(error: Error | undefined): string | null {
  if (!error) return null;
  try {
    const body = JSON.parse(error.message) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Not JSON — fall through to the raw message.
  }
  return error.message || 'Viper could not reply. Try again.';
}

/**
 * The AI Training Chat section: an admin picks a lesson and a persona and
 * chats with Viper to see how it performs. Backed by
 * `POST /api/admin/viper/preview`, which saves nothing.
 *
 * The lesson and persona ride on each send's request body rather than on the
 * transport: `useChat` keeps the transport it was first given for the life of
 * its chat, so a transport-level body would keep sending the first lesson
 * picked. Changing either one starts the conversation over, since a reply
 * scoped to a different lesson or persona would muddy the comparison.
 */
export const PreviewChatContainer = () => {
  const [lessonSlug, setLessonSlug] = useAtom(previewLessonSlugAtom);
  const [pickedPersonaId, setPickedPersonaId] = useAtom(previewPersonaIdAtom);
  const personasQuery = usePersonas();
  const libraryQuery = useOrgLibrary();
  const { scrollRef, contentRef } = useStickToBottom();

  const lessons = libraryQuery.data
    ? flattenLibraryLessons(libraryQuery.data)
    : [];
  const personas = personasQuery.data ?? [];
  // No pick yet means the org default (or, with none set, the first).
  const persona =
    personas.find((p) => p.id === pickedPersonaId) ??
    personas.find((p) => p.isOrgDefault) ??
    personas[0] ??
    null;

  const { messages, status, error, sendMessage, setMessages, stop } = useChat({
    id: 'viper-preview',
    transport: new DefaultChatTransport({ api: '/api/admin/viper/preview' }),
  });
  const isReplying = status === 'submitted' || status === 'streaming';

  const form = useForm<ComposerForm>({
    resolver: zodResolver(composerSchema),
    defaultValues: { text: '' },
  });

  /** Drops the conversation, cutting off any reply still streaming. */
  const startOver = () => {
    if (isReplying) void stop();
    setMessages([]);
  };

  const onLessonChange = (slug: string | null) => {
    if (slug === lessonSlug) return;
    setLessonSlug(slug);
    startOver();
  };

  const onPersonaChange = (id: number) => {
    if (id === persona?.id) return;
    setPickedPersonaId(id);
    startOver();
  };

  const lessonDisabledReason = libraryQuery.isPending
    ? 'Loading lessons'
    : libraryQuery.isError
      ? 'Lessons failed to load'
      : lessons.length === 0
        ? 'No lessons in the library yet'
        : null;

  const personaDisabledReason = personasQuery.isPending
    ? 'Loading personas'
    : personasQuery.isError
      ? 'Personas failed to load'
      : personas.length === 0
        ? 'No personas yet. Create one in the Persona section'
        : null;

  const composerDisabledReason =
    personaDisabledReason ??
    (persona === null
      ? 'Create a persona first'
      : lessonSlug === null
        ? 'Pick a lesson to start'
        : // Each send adds one message; the route takes at most the cap.
          messages.length >= PREVIEW_MAX_MESSAGES
          ? 'This chat is full. Start a new chat'
          : null);

  const submit = form.handleSubmit(async ({ text }) => {
    if (composerDisabledReason !== null || isReplying) return;
    if (persona === null || lessonSlug === null) return;
    form.reset();
    await sendMessage(
      { text },
      { body: { personaId: persona.id, lessonSlug } },
    );
  });

  const lastMessage = messages.at(-1);
  const assistantStarted =
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some((p) => p.type === 'text' && p.text.trim() !== '');

  return (
    <PreviewChat
      lessons={lessons}
      lessonSlug={lessonSlug}
      onLessonChange={onLessonChange}
      lessonPicker={{
        disabledReason: lessonDisabledReason,
        error: libraryQuery.isError ? 'Could not load lessons.' : null,
        onRetry: () => void libraryQuery.refetch(),
      }}
      personas={personas.map((p) => ({
        id: p.id,
        name: p.name,
        isOrgDefault: p.isOrgDefault,
      }))}
      personaId={persona?.id ?? null}
      onPersonaChange={onPersonaChange}
      personaPicker={{
        disabledReason: personaDisabledReason,
        error: personasQuery.isError ? 'Could not load personas.' : null,
        onRetry: () => void personasQuery.refetch(),
      }}
      personaVersion={
        persona === null
          ? null
          : persona.draftContent !== null
            ? 'draft'
            : 'published'
      }
      items={toPreviewItems(messages)}
      showTyping={isReplying && !assistantStarted}
      isReplying={isReplying}
      error={previewErrorMessage(error)}
      onNewChat={startOver}
      onStop={() => void stop()}
      composerDisabledReason={composerDisabledReason}
      inputProps={form.register('text')}
      onInputKeyDown={(event) => {
        // Enter sends; Shift+Enter is a new line; never mid-IME composition.
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          void submit();
        }
      }}
      onSubmit={(event) => void submit(event)}
      scrollRef={scrollRef}
      contentRef={contentRef}
    />
  );
};
