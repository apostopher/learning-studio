import { AlertDialog } from '@base-ui/react/alert-dialog';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpdateLessonVersionDialog } from './update-lesson-version-dialog';

const meta: Meta<typeof UpdateLessonVersionDialog> = {
  title: 'Admin/UpdateLessonVersionDialog',
  component: UpdateLessonVersionDialog,
  args: {
    lessonName: 'Crosswind landings',
    courseName: 'UAS 2-Week',
    from: '1.0',
    to: '1.1',
    contentUpdatedAt: new Date(2026, 10, 24, 9, 38),
    isPending: false,
    onConfirm: () => {},
  },
  decorators: [
    (Story) => (
      <AlertDialog.Root open>
        <Story />
      </AlertDialog.Root>
    ),
  ],
};
export default meta;

export const Asking: StoryObj<typeof UpdateLessonVersionDialog> = {};

export const Updating: StoryObj<typeof UpdateLessonVersionDialog> = {
  args: { isPending: true },
};

/** Refused as out of date: the same dialog, now about v1.2. */
export const Stale: StoryObj<typeof UpdateLessonVersionDialog> = {
  args: {
    to: '1.2',
    error: 'Disciplines has changed since you opened this. Try again.',
  },
};
