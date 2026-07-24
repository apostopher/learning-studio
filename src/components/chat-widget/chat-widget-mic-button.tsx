import { Loader2, Mic } from 'lucide-react';
import { motion } from 'motion/react';
import type { PushToTalkBindings } from '#/components/chat-widget/use-push-to-talk';
import { cn } from '#/lib/cn';

interface ChatWidgetMicButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  reducedMotion: boolean;
  bindings: PushToTalkBindings;
}

/**
 * Why this component is a plain `<button>` instead of the Base UI `Button`:
 * - Checked: `usePushToTalk`'s bindings need a raw `HTMLButtonElement` ref
 *   (`bindings.ref`) to call `setPointerCapture` directly on the DOM node.
 * - Checked: the press-and-hold gesture wires every pointer/keyboard event
 *   itself (down/up/cancel, key down/up, context-menu suppression) — there is
 *   no Base UI primitive for a custom hold gesture to compose with.
 * - Reason: a plain button is the simplest element that satisfies the ref +
 *   raw-event-binding contract `usePushToTalk` was built against.
 *
 * Hookless — receives the full press-and-hold state as props from the
 * `ChatWidgetInput` container; the pulse animation is driven by Motion's
 * `motion.span`, whose internal hooks are library-managed, not called here.
 */
export function ChatWidgetMicButton({
  isRecording,
  isTranscribing,
  isSupported,
  reducedMotion,
  bindings,
}: ChatWidgetMicButtonProps) {
  const title = !isSupported
    ? 'Voice input not supported in this browser'
    : isTranscribing
      ? 'Transcribing…'
      : isRecording
        ? 'Release to send'
        : 'Hold to talk';

  const disabled = !isSupported || isTranscribing;
  const pulsing = isRecording;
  const active = isRecording || isTranscribing;

  return (
    <button
      ref={bindings.ref}
      type="button"
      disabled={disabled}
      onPointerDown={bindings.onPointerDown}
      onPointerUp={bindings.onPointerUp}
      onPointerCancel={bindings.onPointerCancel}
      onKeyDown={bindings.onKeyDown}
      onKeyUp={bindings.onKeyUp}
      onContextMenu={bindings.onContextMenu}
      aria-label={title}
      aria-pressed={isRecording}
      title={title}
      className={cn(
        'flex size-9 shrink-0 touch-none select-none items-center justify-center rounded-lg border',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
        'disabled:cursor-not-allowed',
        active
          ? // Solid red-9 needs text-black (not white) to clear WCAG AA — see
            // the red-9-button-contrast note this repo already follows.
            'border-transparent bg-red-9 text-black hover:bg-red-10'
          : 'border-gray-6 bg-gray-1 text-gray-11 hover:bg-gray-4',
        !isSupported && 'opacity-50',
      )}
    >
      <motion.span
        className="flex items-center justify-center"
        animate={
          pulsing && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }
        }
        transition={
          pulsing && !reducedMotion
            ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.15 }
        }
      >
        {isTranscribing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="size-4" aria-hidden="true" />
        )}
      </motion.span>
    </button>
  );
}
