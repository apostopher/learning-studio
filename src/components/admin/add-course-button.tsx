import type { Button } from '@base-ui/react/button';
import { PaneActionButton } from './pane-action-button';

/**
 * Styled "Add course" button. Used directly, or as a Base UI Dialog trigger
 * via `render`.
 *
 * The label is a prop because the editor's course rail calls the same thing an
 * "offering" — a variant of a course (two-week, mini, full) that a learner
 * actually buys. Offering is an alias of course, not a second table, so the
 * two surfaces share this button and differ only in what they call it.
 */
export const AddCourseButton = ({
  label = 'Add course',
  ...props
}: React.ComponentProps<typeof Button> & { label?: string }) => (
  <PaneActionButton {...props} label={label} />
);
