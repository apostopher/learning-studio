import { Button } from '@base-ui/react/button';
import type { UIMessage } from 'ai';
import type { MotionStyle } from 'motion/react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { ChatWidgetHeader } from '#/components/chat-widget/chat-widget-header';
import { ChatWidgetInput } from '#/components/chat-widget/chat-widget-input';
import { ChatWidgetMessages } from '#/components/chat-widget/chat-widget-messages';
import { ChatWidgetResizeHandles } from '#/components/chat-widget/chat-widget-resize-handles';
import { useChatWindowGeometry } from '#/components/chat-widget/use-chat-window-geometry';
import type { OnboardingStatus } from '#/data-hooks/use-onboarding-chat';
import { cn } from '#/lib/cn';

interface ChatWindowProps {
  fontSize: number;
  onToggleFontSize: () => void;
  onClose: () => void;
  messages: UIMessage[];
  sendMessage: (opts: { text: string }) => void;
  isLoading: boolean;
  /**
   * Onboarding-only. `useOnboardingChat`'s current interview status, passed
   * through solely so this window can decide whether to show the "Looks
   * good" confirm affordance below. The Viper7 container never passes this
   * (or `onConfirm`), so its window renders exactly as before — this is an
   * additive, optional extension, not a behavior change to the shared path.
   */
  status?: OnboardingStatus;
  /**
   * Onboarding-only. Accepts the closing summary — the ONLY way a
   * `'confirming'` session advances to `'complete'` (see
   * `useOnboardingChat`'s `confirm`). Free-text replies always round-trip
   * through the reply route's `{ type: 'reply' }` branch, never
   * `{ type: 'confirm' }`, so without this a confirming session could never
   * be accepted through the UI. Required (paired with `status`) whenever the
   * caller's status can reach `'confirming'`.
   */
  onConfirm?: () => void;
  /**
   * Onboarding-only. Rendered after the last message, inside the scroll flow —
   * today the SKA profile card that closes the interview. Optional and unused
   * by the Viper7 container, so the shared path is unchanged.
   */
  afterMessages?: ReactNode;
}

/**
 * `transformOrigin` uses physical values, not logical ones: it names a
 * corner of THIS element's own scale transform, anchored to where the
 * launcher bubble sits (`bottom-6 end-6` in chat-widget.tsx) — a visual
 * anchor point for a transform, not a flow-relative direction. It matches
 * `computeDefaultRect`'s deliberate `vp.width - MARGIN - width` / `vp.height
 * - MARGIN - height` anchor (`use-chat-window-geometry.ts`), which is itself
 * physical for the same reason: the bubble is always bottom-end of the
 * *viewport*, not of the window's own (draggable) box.
 */
const WINDOW_TRANSFORM_ORIGIN = 'right bottom';

/**
 * The free-floating, draggable/resizable chat window.
 *
 * Custom component — no Base UI equivalent: Base UI has no primitive for an
 * OS-style window with pointer-driven drag/resize geometry, so this is
 * composed from `useChatWindowGeometry` (position/size) plus Base UI-built
 * children (header, messages, input).
 *
 * Position/size ride the geometry hook's motion values (`left`/`top`/`width`/
 * `height`); the enter/exit spring rides scale+opacity only, so the two never
 * fight each other over the same frame. The spring itself grows FROM
 * `WINDOW_TRANSFORM_ORIGIN` — the bubble's corner — so opening reads as the
 * bubble expanding into the window, not an unrelated pop in empty space.
 */
export function ChatWindow({
  fontSize,
  onToggleFontSize,
  onClose,
  messages,
  sendMessage,
  isLoading,
  status,
  onConfirm,
  afterMessages,
}: ChatWindowProps) {
  const {
    left,
    top,
    width,
    height,
    isDirty,
    reset,
    dragBindings,
    getResizeHandleProps,
  } = useChatWindowGeometry();

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      style={
        {
          left,
          top,
          width,
          height,
          transformOrigin: WINDOW_TRANSFORM_ORIGIN,
          '--chat-message-font-size': `${fontSize}px`,
        } as MotionStyle
      }
      className={cn(
        'pointer-events-auto fixed flex flex-col overflow-hidden',
        'rounded-2xl border border-gray-6 bg-gray-2 shadow-2xl',
      )}
    >
      <ChatWidgetResizeHandles getHandleProps={getResizeHandleProps} />
      <ChatWidgetHeader
        isDirty={isDirty}
        onReset={reset}
        onToggleFontSize={onToggleFontSize}
        onClose={onClose}
        dragBindings={dragBindings}
      />
      <ChatWidgetMessages
        messages={messages}
        isLoading={isLoading}
        trailing={afterMessages}
      />
      {status === 'confirming' && onConfirm && (
        <div className="border-gray-6 border-t px-4 py-3">
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'inline-flex w-full items-center justify-center rounded-lg bg-accent-9 px-4 py-2',
              'font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            Looks good
          </Button>
        </div>
      )}
      <ChatWidgetInput
        onSend={(text) => sendMessage({ text })}
        isLoading={isLoading}
      />
    </motion.div>
  );
}
