import { Button } from '@base-ui/react/button';
import { Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

interface PreviewLanguageFallbackProps {
  message: string;
  tone: 'status' | 'alert';
  backLabel: string;
  onBack: () => void;
  /** Extra controls beside the way back (e.g. "Check again"). */
  children?: ReactNode;
}

/**
 * A previewed translation that cannot play: says which one and why, and
 * offers the way back to the primary language — the player, which holds the
 * language menu, is not drawn in this state.
 */
export const PreviewLanguageFallback = ({
  message,
  tone,
  backLabel,
  onBack,
  children,
}: PreviewLanguageFallbackProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    {tone === 'alert' ? (
      <p role="alert" className="text-error-text text-sm">
        {message}
      </p>
    ) : (
      <output className="text-secondary text-sm">{message}</output>
    )}
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <BackToPrimaryLanguageButton label={backLabel} onClick={onBack} />
    </div>
  </div>
);

/** The way back to the primary preview language; shared with the board modal. */
export const BackToPrimaryLanguageButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <Button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-apple-9 px-3.5 py-2 font-medium text-apple-contrast text-sm',
      'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
    )}
  >
    <Languages className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </Button>
);
