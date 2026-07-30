import { Button } from '@base-ui/react/button';
import { Plug } from 'lucide-react';
import { cn } from '#/lib/cn';

interface CredentialNotConnectedProps {
  onConnect: () => void;
}

/**
 * The settled "no key stored" row: says so, and offers the only way forward.
 * Rendered for `absent.idle`.
 */
export const CredentialNotConnected = ({
  onConnect,
}: CredentialNotConnectedProps) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-tertiary text-sm">Not connected</p>
      <Button
        type="button"
        onClick={onConnect}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-apple-9 px-3.5 py-2 font-medium text-apple-contrast text-sm',
          'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
        )}
      >
        <Plug className="h-3.5 w-3.5" aria-hidden="true" />
        Connect
      </Button>
    </div>
  );
};
