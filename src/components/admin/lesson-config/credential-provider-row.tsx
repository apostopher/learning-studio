import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface CredentialProviderRowProps {
  label: string;
  /**
   * True while the credentials query has no data yet. Renders a spinner instead
   * of `children`, so a configured provider never flashes "Not connected".
   */
  isLoading?: boolean;
  children: ReactNode;
}

/**
 * Card chrome for one provider in the course's video-integrations list: the
 * provider name, and whatever the credential flow is currently showing.
 */
export const CredentialProviderRow = ({
  label,
  isLoading = false,
  children,
}: CredentialProviderRowProps) => {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-6 bg-gray-1 p-3.5">
      <span className="font-medium text-primary text-sm">{label}</span>
      {isLoading ? (
        <span className="inline-flex items-center gap-1.5 text-tertiary text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading…
        </span>
      ) : (
        children
      )}
    </div>
  );
};
