import { Button } from '@base-ui/react/button';
import { Tooltip } from '@base-ui/react/tooltip';
import { ALargeSmall, Shrink, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { brand } from '#/ai/prompts/brand';
import type { DragBindings } from '#/components/chat-widget/use-chat-window-geometry';
import { cn } from '#/lib/cn';

interface ChatWidgetHeaderProps {
  isDirty: boolean;
  onReset: () => void;
  onToggleFontSize: () => void;
  onClose: () => void;
  dragBindings: DragBindings;
}

interface HeaderControlButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

/** Icon-only header control: a Base UI `Button` composed with a Base UI
 * `Tooltip` via `render` (requires the app-root `Tooltip.Provider`, see
 * `src/routes/__root.tsx`). */
const HeaderControlButton = ({
  label,
  onClick,
  children,
}: HeaderControlButtonProps) => (
  <Tooltip.Root>
    <Tooltip.Trigger
      render={
        <Button
          onClick={onClick}
          aria-label={label}
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-gray-11 transition-colors',
            'hover:bg-gray-4 hover:text-gray-12',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
          )}
        />
      }
    >
      {children}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={6} className="z-50">
        <Tooltip.Popup className="rounded-md bg-gray-12 px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
          {label}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
);

/** Window title bar: the whole strip is the drag surface (`dragBindings`'
 * `onPointerDown` ignores pointer-downs that originate on a `<button>`, see
 * `useChatWindowGeometry.startDrag`), with the window-control cluster pinned
 * to the inline-end. Hookless — the reset button's enter/exit uses Motion's
 * `AnimatePresence`, which manages its own internal state (library-internal
 * hooks are fine; this component calls none directly). */
export function ChatWidgetHeader({
  isDirty,
  onReset,
  onToggleFontSize,
  onClose,
  dragBindings,
}: ChatWidgetHeaderProps) {
  return (
    <div
      {...dragBindings}
      className="flex cursor-grab touch-none select-none items-center gap-3 border-gray-6 border-b px-4 py-3 active:cursor-grabbing"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-9 text-accent-contrast text-xs font-bold">
        V7
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-12">{brand.ai.name}</p>
        <p className="text-xs text-gray-11">AI Assistant</p>
      </div>

      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <HeaderControlButton
              label="Reset size and position"
              onClick={onReset}
            >
              <Shrink className="size-4" aria-hidden="true" />
            </HeaderControlButton>
          </motion.div>
        )}
      </AnimatePresence>

      <HeaderControlButton label="Toggle font size" onClick={onToggleFontSize}>
        <ALargeSmall className="size-4" aria-hidden="true" />
      </HeaderControlButton>
      <HeaderControlButton label="Close chat" onClick={onClose}>
        <X className="size-4" aria-hidden="true" />
      </HeaderControlButton>
    </div>
  );
}
