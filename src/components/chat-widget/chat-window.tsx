import type { UIMessage } from 'ai';
import type { MotionStyle } from 'motion/react';
import { motion } from 'motion/react';
import { ChatWidgetHeader } from '#/components/chat-widget/chat-widget-header';
import { ChatWidgetInput } from '#/components/chat-widget/chat-widget-input';
import { ChatWidgetMessages } from '#/components/chat-widget/chat-widget-messages';
import { ChatWidgetResizeHandles } from '#/components/chat-widget/chat-widget-resize-handles';
import { useChatWindowGeometry } from '#/components/chat-widget/use-chat-window-geometry';
import { cn } from '#/lib/cn';

interface ChatWindowProps {
  fontSize: number;
  onToggleFontSize: () => void;
  onClose: () => void;
  messages: UIMessage[];
  sendMessage: (opts: { text: string }) => void;
  isLoading: boolean;
}

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
 * fight each other over the same frame.
 */
export function ChatWindow({
  fontSize,
  onToggleFontSize,
  onClose,
  messages,
  sendMessage,
  isLoading,
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
          transformOrigin: 'center',
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
      <ChatWidgetMessages messages={messages} isLoading={isLoading} />
      <ChatWidgetInput
        onSend={(text) => sendMessage({ text })}
        isLoading={isLoading}
      />
    </motion.div>
  );
}
