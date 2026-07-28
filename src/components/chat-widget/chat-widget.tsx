import { useRouterState } from '@tanstack/react-router';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect } from 'react';
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
  isOpen: boolean;
  fontSize: number;
  onToggleFontSize: () => void;
  onClose: () => void;
}

/**
 * Viper7 assistant conversation. Wraps `useChatWidget()` (the streaming
 * `/api/chat` hook) and feeds its result into the shared, mode-agnostic
 * `ChatWindow`.
 *
 * Always mounted by the top-level `ChatWidget` regardless of `isOpen` or
 * `chatWidgetModeAtom` — `useChatWidget()` has no server-side rehydration on
 * mount (no `initialMessages`), so its `useChat` instance and `chatIdRef`
 * are the ONLY thing holding the live conversation client-side. Unmounting
 * this component (as the widget used to, by nesting it inside
 * `{isOpen && ...}`) destroys that state: `messages` resets to empty and
 * `chatIdRef.current` goes back to `undefined`, so the next reply's
 * `ensureChat` call inserts a brand new `aiChats` row instead of continuing
 * the old one — silent data loss and an orphaned DB row on every
 * close/reopen. `isOpen` is taken as a prop purely to decide whether to
 * render the `<ChatWindow>` (with its own `AnimatePresence` for the
 * enter/exit spring); it never gates whether this component itself exists.
 *
 * Contrast with `OnboardingChat` below, which mounts/unmounts freely — its
 * hook rehydrates the persisted transcript from the server on every mount by
 * design, specifically so pause/resume never loses data.
 */
function Viper7Chat({
  isOpen,
  fontSize,
  onToggleFontSize,
  onClose,
}: ChatWindowChromeProps) {
  const { messages, sendMessage, isLoading } = useChatWidget();

  return (
    <AnimatePresence>
      {isOpen && (
        <ChatWindow
          fontSize={fontSize}
          onToggleFontSize={onToggleFontSize}
          onClose={onClose}
          messages={messages}
          sendMessage={sendMessage}
          isLoading={isLoading}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * Course-onboarding interview conversation. Wraps `useOnboardingChat`
 * (Task 6's data hook — `start`/`reply`/`confirm`/`delete`) and feeds its
 * result into the same `ChatWindow` used by `Viper7Chat`, passing `status`
 * and `confirm` through so the window can offer the "Looks good" affordance
 * needed to advance a `'confirming'` session (see `ChatWindowProps`' doc
 * comments in `chat-window.tsx`).
 *
 * Mounted by the top-level `ChatWidget` only while `chatWidgetModeAtom` is
 * `'onboarding'` — unlike `Viper7Chat`, that's safe here: `useOnboardingChat`
 * re-fetches the persisted session on every mount (`start` doubles as its
 * `useQuery`), so mounting/unmounting this component never loses data; it's
 * exactly the "rehydrate per request" architecture the backend was built
 * around, which is what lets closing mid-interview act as a supported pause.
 *
 * Reports back to the parent via `onSettled` once the interview reaches a
 * terminal status (`'complete'`, `'declined'`, `'deleted'`) — see
 * `ChatWidget`'s `handleOnboardingSettled` for what that does.
 */
function OnboardingChat({
  courseSlug,
  isOpen,
  fontSize,
  onToggleFontSize,
  onClose,
  onSettled,
}: ChatWindowChromeProps & { courseSlug: string; onSettled: () => void }) {
  const { messages, sendMessage, isLoading, status, confirm } =
    useOnboardingChat(courseSlug);

  // Terminal statuses mean there is nothing left to resume — staying in
  // onboarding mode past this point would strand the shared widget on a
  // dead conversation with no way back to Viper7 (see `handleOnboardingSettled`).
  // 'awaiting_consent' / 'awaiting_answer' / 'confirming' are deliberately
  // NOT included: those must keep the widget in onboarding mode across a
  // close/reopen so resuming a paused interview keeps working.
  useEffect(() => {
    if (
      status === 'complete' ||
      status === 'declined' ||
      status === 'deleted'
    ) {
      onSettled();
    }
  }, [status, onSettled]);

  return (
    <AnimatePresence>
      {isOpen && (
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
      )}
    </AnimatePresence>
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
 * regardless of which mode is active.
 *
 * `Viper7Chat` is always mounted (its `isOpen` prop only ever gates whether
 * its `<ChatWindow>` renders) so its live conversation state survives every
 * open/close and every mode switch. `OnboardingChat` mounts only while
 * `chatWidgetModeAtom.kind === 'onboarding'` — safe because it rehydrates
 * from the server on every mount. `handleOnboardingSettled` resets the mode
 * atom back to `'viper7'` once an interview reaches a terminal status, which
 * is the only thing that unmounts `OnboardingChat` again; closing the widget
 * alone never does, so a paused mid-interview session stays reachable.
 *
 * Gated to signed-in, non-admin routes: the launcher bubble, both
 * conversation windows, and `OnboardingChat` itself are all hidden while
 * there is no session or the current route is under `/admin` — the admin
 * surface has its own tooling and shouldn't show the learner-facing chat
 * launcher. `Viper7Chat`, however, is NOT gated by this — see its own doc
 * comment above for why: `ChatWidget` is mounted once, unconditionally, at
 * the app root (`src/routes/__root.tsx`), so it never itself unmounts across
 * route navigation. Before this component grew a mode split, `useChatWidget`
 * was called directly in `ChatWidget`'s body, so it kept running (and its
 * `useChat` state stayed alive) on every render where this admin/session
 * check made the component return `null`. Making that same check unmount a
 * *child* component holding the hook would reintroduce exactly the kind of
 * state loss this task's review caught — just triggered by admin navigation
 * instead of closing the widget. So the check here only ever suppresses
 * `Viper7Chat`'s window (via its `isOpen` prop) and the rest of the visible
 * chrome, never the component itself.
 */
export function ChatWidget() {
  const [fontSize, setFontSize] = useAtom(chatWidgetFontSizeAtom);
  const [isOpen, setIsOpen] = useAtom(chatWidgetOpenAtom);
  const mode = useAtomValue(chatWidgetModeAtom);
  const setMode = useSetAtom(chatWidgetModeAtom);
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const hidden = !session || pathname.startsWith('/admin');

  const toggleFontSize = () =>
    setFontSize((current) => (current === 16 ? 18 : 16));
  const onClose = () => setIsOpen(false);
  // Stable identity so `OnboardingChat`'s effect can depend on it honestly.
  const handleOnboardingSettled = useCallback(
    () => setMode({ kind: 'viper7' }),
    [setMode],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Window (open): a free-floating, draggable, resizable OS-style window.
          Always mounted (see doc comment above) — `hidden` only ever
          suppresses its window via `isOpen`, never the component itself. */}
      <Viper7Chat
        isOpen={!hidden && isOpen && mode.kind === 'viper7'}
        fontSize={fontSize}
        onToggleFontSize={toggleFontSize}
        onClose={onClose}
      />

      {!hidden && mode.kind === 'onboarding' && (
        <OnboardingChat
          key={mode.courseSlug}
          courseSlug={mode.courseSlug}
          isOpen={isOpen}
          fontSize={fontSize}
          onToggleFontSize={toggleFontSize}
          onClose={onClose}
          onSettled={handleOnboardingSettled}
        />
      )}

      {/* Trigger bubble (closed): its own fixed anchor, hidden while the window is open */}
      <AnimatePresence>
        {!hidden && !isOpen && (
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
