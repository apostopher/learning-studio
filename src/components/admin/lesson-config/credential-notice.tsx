import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

interface CredentialNoticeProps {
  /**
   * `info` — neutral context about the current state (e.g. a key is already
   * saved). `error` — something is broken and blocks playback (e.g. the stored
   * key is no longer accepted); announced to assistive tech.
   */
  tone: 'info' | 'error';
  children: ReactNode;
}

/**
 * Why this component exists:
 * - Checked: Base UI ships no Alert/Callout/Banner primitive — only
 *   `alert-dialog`, which is a modal and wrong for inline, non-blocking text.
 * - Checked: cannot compose existing primitives; this is a styled container
 *   with an icon and a message — there is nothing to wrap.
 * - Reason: no base equivalent exists.
 */
export const CredentialNotice = ({ tone, children }: CredentialNoticeProps) => {
  const isError = tone === 'error';
  const Icon = isError ? AlertTriangle : Info;

  return (
    <div
      // Errors here describe a broken stored credential the admin has to act
      // on, so they interrupt; the info tone is expected content inside a panel
      // the admin just opened and must not be announced.
      role={isError ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm',
        isError
          ? 'border-error-a6 bg-error-a3 text-error-text'
          : 'border-gray-6 bg-gray-2 text-secondary',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          isError ? 'text-error-text' : 'text-tertiary',
        )}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p className="min-w-0">{children}</p>
      </div>
    </div>
  );
};
