import type { Meta, StoryObj } from '@storybook/react-vite';
import { VersionField } from './version-field';

const meta: Meta<typeof VersionField> = {
  title: 'Admin/LessonConfig/VersionField',
  component: VersionField,
  args: {
    id: 'lesson-version-10',
    formId: 'lesson-material-form-10',
    register: {
      name: 'version',
      onChange: async () => {},
      onBlur: async () => {},
      ref: (input: HTMLInputElement | null) => {
        if (input) input.value = '1.0';
      },
    },
    lockedReason: null,
    readOnly: false,
  },
  decorators: [
    (Story) => (
      <div className="max-w-md bg-surface p-6">
        <Story />
      </div>
    ),
  ],
};
export default meta;

const LOCKED =
  'v1.0 is used by 3 courses. Enter a higher version to make changes.';

export const Unlocked: StoryObj<typeof VersionField> = {};

export const Locked: StoryObj<typeof VersionField> = {
  args: { lockedReason: LOCKED },
};

export const Saving: StoryObj<typeof VersionField> = {
  args: { lockedReason: LOCKED, readOnly: true },
};

/** A save was refused for the reason already on show: said once, as the error. */
export const LockedAndRefused: StoryObj<typeof VersionField> = {
  args: { lockedReason: LOCKED, error: LOCKED },
};

/** Another problem with what was typed: both stay visible. */
export const LockedWithError: StoryObj<typeof VersionField> = {
  args: {
    lockedReason: LOCKED,
    error: 'Enter a version higher than v1.0.',
  },
};
