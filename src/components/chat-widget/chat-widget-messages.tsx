import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';
import { ChatMessage } from '#/components/chat-widget/chat-message';
import { TypingDots } from '#/components/chat-widget/typing-dots';
import { ScrollArea } from '#/components/scroll-area';
import { AIWriterDataNotificationSchema } from '#/types';

export interface ChatWidgetMessagesProps {
  messages: UIMessage[];
  /** True while a reply is pending/streaming (status submitted|streaming). */
  isLoading: boolean;
  /**
   * Rendered after the last message, INSIDE the scroll content — for anything
   * that belongs to the end of the conversation rather than to the window
   * chrome (today: the SKA profile card at the end of onboarding).
   *
   * In the scroll flow rather than in a fixed footer on purpose: the card is
   * tall and editable, and a footer would either pin a form over the
   * transcript or force the card to scroll independently of the conversation
   * it belongs to. Inside the content, `useStickToBottom` also brings it into
   * view on arrival, which is the whole point of showing it here.
   */
  trailing?: ReactNode;
}

/** Whether the assistant has started emitting visible text for the last turn.
 * Once it has, the streaming text itself signals progress and the typing dots
 * are hidden. */
function assistantHasStartedAnswering(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  return (
    last?.role === 'assistant' &&
    last.parts.some((p) => p.type === 'text' && p.text.trim().length > 0)
  );
}

/** Auto-scrolling message list for the chat widget. Container (not
 * presentational): owns `useStickToBottom`'s scroll/content refs so new
 * messages/streaming tokens keep the view pinned to the bottom until the
 * user scrolls away. Renders each message's `text` parts via `ChatMessage`
 * and any `data-notification` parts (e.g. "Searching the knowledge base…")
 * as a muted status line — every other part type is skipped for v1. */
export function ChatWidgetMessages({
  messages,
  isLoading,
  trailing,
}: ChatWidgetMessagesProps) {
  const { scrollRef, contentRef } = useStickToBottom();
  const showTyping = isLoading && !assistantHasStartedAnswering(messages);

  return (
    <ScrollArea
      viewportRef={scrollRef}
      className="min-h-0 flex-1"
      viewportClassName="px-3 py-3"
    >
      <div ref={contentRef} className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {messages.map((message) =>
            message.parts.map((part, index) => {
              const key = `${message.id}-${index}`;

              if (part.type === 'text') {
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      type: 'spring',
                      bounce: 0.15,
                      duration: 0.35,
                    }}
                  >
                    <ChatMessage text={part.text} role={message.role} />
                  </motion.div>
                );
              }

              const notification =
                AIWriterDataNotificationSchema.safeParse(part);
              if (notification.success) {
                return (
                  <motion.p
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-1 text-xs text-secondary italic"
                  >
                    {notification.data.data.text}
                  </motion.p>
                );
              }

              return null;
            }),
          )}
          {showTyping && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            >
              <TypingDots />
            </motion.div>
          )}
        </AnimatePresence>
        {trailing}
      </div>
    </ScrollArea>
  );
}
