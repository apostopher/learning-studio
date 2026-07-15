import { Button } from '@base-ui/react/button';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { iconButtonClass } from './tooltip-icon-button';

/**
 * Icon-only "Add module" button. Shares the admin toolbar icon-button style so
 * it sits as a peer of the module sub-header actions. Used as a Base UI Dialog
 * trigger (composed with a Tooltip trigger) via `render`.
 */
export const AddModuleButton = (props: React.ComponentProps<typeof Button>) => {
  return (
    <Button
      {...props}
      aria-label="Add module"
      className={cn(iconButtonClass(), props.className)}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
};
