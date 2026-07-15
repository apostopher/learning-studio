import { Button } from '@base-ui/react/button';
import { Plus } from 'lucide-react';

/**
 * Unwired for step 1 — opens the create-course flow in a later step.
 */
export const AddCourseButton = () => {
  return (
    <Button
      onClick={() => {
        // TODO(step 2): open create-course flow
      }}
      className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add course
    </Button>
  );
};
