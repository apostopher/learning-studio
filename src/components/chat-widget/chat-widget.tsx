import { useRouterState } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { AnimatePresence, motion } from 'motion/react';
import { ChatWindow } from '#/components/chat-widget/chat-window';
import { MessageCircle } from '#/components/chat-widget/message-circle';
import { useChatWidget } from '#/components/chat-widget/use-chat-widget';
import { chatWidgetFontSizeAtom } from '#/atoms/chat-widget';
import { authClient } from '#/lib/auth-client';
import { cn } from '#/lib/cn';

/**
 * Top-level chat widget: a fixed full-viewport overlay that swaps between a
 * launcher bubble (closed) and the free-floating `ChatWindow` (open) with an
 * `AnimatePresence` spring transition, mirroring the old Next.js widget.
 *
 * Gated to signed-in, non-admin routes: hidden entirely (renders `null`) when
 * there is no session, or when the current route is under `/admin` — the
 * admin surface has its own tooling and shouldn't show the learner-facing
 * chat launcher.
 */
export function ChatWidget() {
  const [fontSize, setFontSize] = useAtom(chatWidgetFontSizeAtom);
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isOpen, setIsOpen, messages, sendMessage, isLoading } =
    useChatWidget();

  if (!session || pathname.startsWith('/admin')) return null;

  const toggleFontSize = () =>
    setFontSize((current) => (current === 16 ? 18 : 16));

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Window (open): a free-floating, draggable, resizable OS-style window */}
      <AnimatePresence>
        {isOpen && (
          <ChatWindow
            fontSize={fontSize}
            onToggleFontSize={toggleFontSize}
            onClose={() => setIsOpen(false)}
            messages={messages}
            sendMessage={sendMessage}
            isLoading={isLoading}
          />
        )}
      </AnimatePresence>

      {/* Trigger bubble (closed): its own fixed anchor, hidden while the window is open */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            type="button"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }}
            onClick={() => setIsOpen(true)}
            aria-label="Open chat"
            className={cn(
              'pointer-events-auto fixed bottom-6 end-6 flex size-14 items-center justify-center rounded-full shadow-lg',
              'bg-apple-9 text-apple-contrast',
              'transition-colors duration-200 hover:bg-apple-10',
            )}
          >
            <MessageCircle className="size-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
