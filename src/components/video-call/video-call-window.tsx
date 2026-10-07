import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { videoWindowRectAtom } from '#/atoms/video-call';
import { ChatWidgetResizeHandles } from '#/components/chat-widget/chat-widget-resize-handles';
import {
  computeDefaultVideoRect,
  useChatWindowGeometry,
} from '#/components/chat-widget/use-chat-window-geometry';
import { cn } from '#/lib/cn';

/**
 * The popped-out video window. Custom for the same reason as ChatWindow (no
 * Base UI primitive for a draggable/resizable OS-style window); it reuses
 * ChatWindow's geometry hook with its own persisted rect and default spot.
 * Its only exit is the stage's "End call" / "Bring video back" controls.
 */
export function VideoCallWindow({ children }: { children: ReactNode }) {
  const { left, top, width, height, dragBindings, getResizeHandleProps } =
    useChatWindowGeometry({
      rectAtom: videoWindowRectAtom,
      computeDefault: computeDefaultVideoRect,
    });

  return (
    <motion.div
      role="dialog"
      aria-label="Video call with Viper7"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      style={{ left, top, width, height }}
      className={cn(
        'pointer-events-auto fixed flex flex-col overflow-hidden',
        'rounded-2xl border border-gray-6 bg-gray-2 shadow-2xl',
      )}
    >
      <ChatWidgetResizeHandles getHandleProps={getResizeHandleProps} />
      <div
        {...dragBindings}
        className="flex cursor-grab touch-none select-none items-center border-gray-6 border-b px-3 py-2 active:cursor-grabbing"
      >
        <span className="font-medium text-primary text-sm">
          Video call · Viper7
        </span>
      </div>
      {children}
    </motion.div>
  );
}
