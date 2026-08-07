import { Tooltip } from '@base-ui/react/tooltip';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

type IconButtonVariant = 'default' | 'danger';

/**
 * Shared visual styling for the icon-only action buttons.
 *
 * Both `disabled:` and `aria-disabled:` are listed because this class is used
 * on two different kinds of element: plain `<button>`s (which take the native
 * attribute) and Base UI's `Tooltip.Trigger` (which does not — see
 * TooltipIconButton).
 */
export const iconButtonClass = (variant: IconButtonVariant = 'default') =>
  cn(
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
    'disabled:pointer-events-none disabled:opacity-50',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variant === 'danger'
      ? 'hover:bg-error-9/15 hover:text-error-text'
      : 'hover:bg-gray-4 hover:text-primary',
  );

/** Tooltip popup shared across admin icon buttons. Requires a `Tooltip.Provider` ancestor. */
export const IconButtonTooltip = ({ label }: { label: string }) => (
  <Tooltip.Portal>
    <Tooltip.Positioner sideOffset={6} className="z-50">
      <Tooltip.Popup className="rounded-md bg-inverted px-2 py-1 text-xs font-medium text-gray-1 shadow-md">
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
  /**
   * Merged after the variant classes, so a caller can override the 28px
   * admin-toolbar sizing. Headers and other touch-reachable surfaces need a
   * larger target than a dense toolbar does.
   */
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}

/** Icon-only button with a Base UI tooltip. Requires a `Tooltip.Provider` ancestor. */
export const TooltipIconButton = ({
  label,
  onClick,
  variant = 'default',
  className,
  disabled,
  children,
}: TooltipIconButtonProps) => {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        type="button"
        // `aria-disabled`, NOT the native `disabled` attribute. Base UI's
        // Tooltip.Trigger deliberately swallows `disabled` — it renders
        // `data-trigger-disabled` and keeps the element interactive so a
        // tooltip can still explain why the control is unavailable. Passing
        // `disabled` here therefore does nothing: the button stays clickable
        // and the `disabled:` classes never match.
        //
        // Guarding the handler as well is what actually makes it inert. CSS
        // `pointer-events-none` stops the pointer but not Enter or Space, and
        // `aria-disabled` is an announcement, not an enforcement.
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled || undefined}
        aria-label={label}
        className={cn(iconButtonClass(variant), className)}
      >
        {children}
      </Tooltip.Trigger>
      <IconButtonTooltip label={label} />
    </Tooltip.Root>
  );
};
