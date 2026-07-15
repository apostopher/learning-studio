import { Tooltip } from '@base-ui/react/tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TooltipIconButtonProps {
  /** Tooltip text and accessible label for the icon-only button. */
  label: string;
  /** Omit to render an inert button that still shows its tooltip. */
  onClick?: () => void;
  variant?: 'default' | 'danger';
  children: ReactNode;
}

/** Icon-only button with a Base UI tooltip. Requires a `Tooltip.Provider` ancestor. */
export const TooltipIconButton = ({
  label,
  onClick,
  variant = 'default',
  children,
}: TooltipIconButtonProps) => {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-10 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
          variant === 'danger'
            ? 'hover:bg-red-9/15 hover:text-red-11'
            : 'hover:bg-gray-4 hover:text-gray-12',
        )}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup className="rounded-md bg-gray-12 px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};
