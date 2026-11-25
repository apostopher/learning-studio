import { Tooltip } from '@base-ui/react/tooltip';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { VersionChip } from './version-chip';

const meta: Meta<typeof VersionChip> = {
  title: 'Admin/VersionChip',
  component: VersionChip,
  args: { version: '1.0', disciplineVersion: '1.1', editedIn: 'CPL' },
  decorators: [
    (Story) => (
      <Tooltip.Provider>
        <div className="bg-gray-1 p-6">
          <Story />
        </div>
      </Tooltip.Provider>
    ),
  ],
};
export default meta;

export const UpToDate: StoryObj<typeof VersionChip> = {
  args: { disciplineVersion: '1.0' },
};

export const UpdateAvailable: StoryObj<typeof VersionChip> = {};
