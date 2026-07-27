import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Textarea that grows with its content via CSS `field-sizing: content`.
 * Hookless presentational input. (Base UI has no auto-grow textarea primitive.)
 */
export const AutoGrowTextarea = ({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    rows={1}
    {...props}
    className={cn(
      'field-sizing-content min-h-9 w-full resize-none rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
      className,
    )}
  />
);
