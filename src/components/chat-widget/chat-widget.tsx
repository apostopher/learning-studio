import { useRouterState } from '@tanstack/react-router';
import { useAtom, useAtomValue } from 'jotai';
import { AnimatePresence, motion } from 'motion/react';
import {
  chatWidgetFontSizeAtom,
  chatWidgetModeAtom,
  chatWidgetOpenAtom,
} from '#/atoms/chat-widget';
import { ChatWindow } from '#/components/chat-widget/chat-window';
import { MessageCircle } from '#/components/chat-widget/message-circle';
import { useChatWidget } from '#/components/chat-widget/use-chat-widget';
import { useOnboardingChat } from '#/data-hooks/use-onboarding-chat';
import { authClient } from '#/lib/auth-client';
import { cn } from '#/lib/cn';

interface ChatWindowChromeProps {
  fontSize: number;
  onToggleFontSize: () => void;
  onClose: () => void;
}

/**
 * Viper7 assistant conversation. Wraps `useChatWidget()` (the streaming
 * `/api/chat` hook) and feeds its result into the shared, mode-agnostic
 * `ChatWindow`. Sibling to `OnboardingChat` below — the top-level
 * `ChatWidget` mounts exactly one of the two, so this never calls
 * `useOnboardingChat` and never fires an onboarding request.
 */
function Viper7Chat({
  fontSize,
  onToggleFontSize,
  onClose,
}: ChatWindowChromeProps) {
  const { messages, sendMessage, isLoading } = useChatWidget();

  return (
    <ChatWindow
      fontSize={fontSize}
      onToggleFontSize={onToggleFontSize}
      onClose={onClose}
      messages={messages}
      sendMessage={sendMessage}
      isLoading={isLoading}
    />
  );
}

/**
 * Course-onboarding interview conversation. Wraps `useOnboardingChat`
 * (Task 6's data hook — `start`/`reply`/`confirm`/`delete`) and feeds its
 * result into the same `ChatWindow` used by `Viper7Chat`, passing `status`
 * and `confirm` through so the window can offer the "Looks good" affordance
 * needed to advance a `'confirming'` session (see `ChatWindowProps`' doc
 * comments in `chat-window.tsx`). Sibling to `Viper7Chat`, not a shared
 * "call both hooks" component — only one of the two is ever mounted, so
 * `useOnboardingChat`'s unconditional `start` query never fires while the
 * widget is in Viper7 mode.
 */
function OnboardingChat({
  courseSlug,
  fontSize,
  onToggleFontSize,
  onClose,
}: ChatWindowChromeProps & { courseSlug: string }) {
  const { messages, sendMessage, isLoading, status, confirm } =
    useOnboardingChat(courseSlug);

  return (
    <ChatWindow
      fontSize={fontSize}
      onToggleFontSize={onToggleFontSize}
      onClose={onClose}
      messages={messages}
      sendMessage={sendMessage}
      isLoading={isLoading}
      status={status}
      onConfirm={confirm}
    />
  );
}

/**
 * Top-level chat widget: a fixed full-viewport overlay that swaps between a
 * launcher bubble (closed) and the free-floating `ChatWindow` (open) with an
 * `AnimatePresence` spring transition, mirroring the old Next.js widget.
 *
 * Owns the chrome shared by every conversation mode — open/close state, font
 * size, the launcher bubble, the signed-in/non-admin gate — directly off
 * `chatWidgetOpenAtom`/`chatWidgetFontSizeAtom` so that state stays shared
 * regardless of which mode is active. Which conversation actually drives the
 * window is `chatWidgetModeAtom`: `'viper7'` mounts `Viper7Chat`,
 * `'onboarding'` mounts `OnboardingChat`. Exactly one is ever mounted — this
 * is ordinary conditional rendering, not a conditional-hooks violation; each
 * mode is its own component instance, not a hook called conditionally within
 * one.
 *
 * Gated to signed-in, non-admin routes: hidden entirely (renders `null`) when
 * there is no session, or when the current route is under `/admin` — the
 * admin surface has its own tooling and shouldn't show the learner-facing
 * chat launcher.
 */
export function ChatWidget() {
  const [fontSize, setFontSize] = useAtom(chatWidgetFontSizeAtom);
  const [isOpen, setIsOpen] = useAtom(chatWidgetOpenAtom);
  const mode = useAtomValue(chatWidgetModeAtom);
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!session || pathname.startsWith('/admin')) return null;

  const toggleFontSize = () =>
    setFontSize((current) => (current === 16 ? 18 : 16));
  const onClose = () => setIsOpen(false);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Window (open): a free-floating, draggable, resizable OS-style window */}
      <AnimatePresence>
        {isOpen &&
          (mode.kind === 'onboarding' ? (
            <OnboardingChat
              key="onboarding"
              courseSlug={mode.courseSlug}
              fontSize={fontSize}
              onToggleFontSize={toggleFontSize}
              onClose={onClose}
            />
          ) : (
            <Viper7Chat
              key="viper7"
              fontSize={fontSize}
              onToggleFontSize={toggleFontSize}
              onClose={onClose}
            />
          ))}
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
              'bg-accent-9 text-accent-contrast',
              'transition-colors duration-200 hover:bg-accent-10',
            )}
          >
            <MessageCircle className="size-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
