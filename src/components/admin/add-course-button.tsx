import type { Button } from '@base-ui/react/button';
import { PaneActionButton } from './pane-action-button';

/**
 * Styled "New course" button. Used directly, or as a Base UI Dialog trigger
 * via `render`.
 */
export const AddCourseButton = (props: React.ComponentProps<typeof Button>) => (
  <PaneActionButton {...props} label="New course" />
);
