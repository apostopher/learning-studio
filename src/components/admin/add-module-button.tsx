import { Button } from '@base-ui/react/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Styled "Add module" button. Used as a Base UI Dialog trigger via `render`. */
export const AddModuleButton = (props: React.ComponentProps<typeof Button>) => {
  return (
    <Button
      {...props}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3.5 py-2 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
        props.className,
      )}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add module
    </Button>
  );
};
