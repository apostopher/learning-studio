import { Button } from '@base-ui/react/button';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '#/lib/cn';

/**
 * Turns a provider's secret-free `display` payload into a readable line —
 * `{ apiKeyLast4: '1234' }` becomes "Api key last4: 1234". Generic across
 * providers so a new provider needs no change here.
 */
export function formatCredentialDisplay(
  display: Record<string, unknown>,
): string {
  return Object.entries(display)
    .map(([key, value]) => {
      const label = key
        .replace(/([A-Z0-9]+)/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      return `${label}: ${String(value)}`;
    })
    .join(' · ');
}

interface CredentialSummaryProps {
  /** Secret-free identifying fragment from the server (never the key itself). */
  display: Record<string, unknown>;
  /**
   * When the key was last written. Deliberately *not* labelled "verified": the
   * server stamps this on every save and never refreshes it, so it says nothing
   * about whether the provider still accepts the key.
   */
  lastSavedAt: Date | null;
  onUpdate: () => void;
  onRemove?: () => void;
  isRemoving?: boolean;
}

/**
 * The settled state for a course+provider that already has a key: what's stored
 * (identifying fragment only), when it was saved, and the way back into the
 * form. Rendered for both `configured.summary` and above the rejection notice.
 */
export const CredentialSummary = ({
  display,
  lastSavedAt,
  onUpdate,
  onRemove,
  isRemoving = false,
}: CredentialSummaryProps) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <CheckCircle2
          className="h-4 w-4 shrink-0 text-success-text"
          aria-hidden="true"
        />
        <p className="min-w-0 text-secondary text-sm">
          <span className="font-medium text-primary">
            {formatCredentialDisplay(display)}
          </span>
          {lastSavedAt && (
            <span className="text-tertiary">
              {' · saved '}
              {format(lastSavedAt, "d MMM yyyy 'at' h:mm a")}
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          onClick={onUpdate}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm',
            'transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
          )}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Update key
        </Button>

        {onRemove && (
          <Button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-error-text text-sm',
              'transition-colors hover:bg-error-a3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isRemoving ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Remove
          </Button>
        )}
      </div>
    </div>
  );
};
