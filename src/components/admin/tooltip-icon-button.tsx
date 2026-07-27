import { Tooltip } from '@base-ui/react/tooltip';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type IconButtonVariant = 'default' | 'danger';

/** Shared visual styling for the icon-only action buttons in admin toolbars. */
export const iconButtonClass = (variant: IconButtonVariant = 'default') =>
  cn(
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
    variant === 'danger'
      ? 'hover:bg-red-9/15 hover:text-error-text'
      : 'hover:bg-gray-4 hover:text-primary',
  );

/** Tooltip popup shared across admin icon buttons. Requires a `Tooltip.Provider` ancestor. */
export const IconButtonTooltip = ({ label }: { label: string }) => (
  <Tooltip.Portal>
    <Tooltip.Positioner sideOffset={6} className="z-50">
      <Tooltip.Popup className="rounded-md bg-gray-12 px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
        {label}
      </Tooltip.Popup>
    </Tooltip.Positioner>
  </Tooltip.Portal>
);

interface TooltipIconButtonProps {
  /** Tooltip text and accessible label for the icon-only button. */
  label: string;
  /** Omit to render an inert button that still shows its tooltip. */
  onClick?: () => void;
  variant?: IconButtonVariant;
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
        className={iconButtonClass(variant)}
      >
        {children}
      </Tooltip.Trigger>
      <IconButtonTooltip label={label} />
    </Tooltip.Root>
  );
};
