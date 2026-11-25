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

export const Default: StoryObj<typeof VersionField> = {};

export const Saving: StoryObj<typeof VersionField> = {
  args: { readOnly: true },
};

export const Malformed: StoryObj<typeof VersionField> = {
  args: { error: 'Use a number like 1.0' },
};
