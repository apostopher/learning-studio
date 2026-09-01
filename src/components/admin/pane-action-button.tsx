import { Button } from '@base-ui/react/button';
import { Plus } from 'lucide-react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// reached by the pane-header tests.
import { cn } from '#/lib/cn';

/**
 * The "add something to this pane" action as it appears in a pane header: a
 * solid accent button with a leading plus and a caller-supplied label.
 *
 * One component rather than one per pane. The editor's two headers each carry
 * one of these ("Add discipline" on the library, "New offering" on the course
 * rail) and they must be the same height, since they sit side by side across
 * the splitter — which they cannot be if they are two copies of a long class
 * string that drift apart.
 *
 * Used directly, or as a Base UI Dialog trigger via `render`. The label is
 * passed as a prop rather than as children so that a `render` parent cloning
 * this element cannot replace the text with its own.
 */
export const PaneActionButton = ({
  label,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) => (
  <Button
    {...props}
    className={cn(
      'inline-flex items-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
      className,
    )}
  >
    <Plus className="h-4 w-4" aria-hidden="true" />
    {label}
  </Button>
);
