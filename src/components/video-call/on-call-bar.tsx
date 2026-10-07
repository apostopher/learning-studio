import { Button } from '@base-ui/react/button';
import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

export function OnCallBar({
  countdown,
  onBringBack,
}: {
  countdown: ReactNode;
  onBringBack: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-gray-6 border-b bg-gray-3 px-3 py-2 text-sm">
      <span className="size-2 shrink-0 rounded-full bg-error-9" aria-hidden />
      <span className="text-primary">
        On a call · <span className="tabular-nums">{countdown}</span>
      </span>
      <Button
        onClick={onBringBack}
        className={cn(
          'ms-auto rounded-md px-2 py-1 font-medium text-accent-text transition-colors hover:bg-gray-4',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
        )}
      >
        Bring video back
      </Button>
    </div>
  );
}
