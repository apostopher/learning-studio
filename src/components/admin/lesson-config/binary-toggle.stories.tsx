import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { BinaryToggle } from './binary-toggle';
import { ConfigSettingRow } from './config-setting-row';

const meta: Meta<typeof BinaryToggle> = {
  title: 'Admin/LessonConfig/BinaryToggle',
  component: BinaryToggle,
};
export default meta;

const Rows = () => {
  const [availability, setAvailability] = useState<'public' | 'private'>(
    'public',
  );
  const [access, setAccess] = useState<'free' | 'subscription'>('free');
  const [watch, setWatch] = useState<'required' | 'optional'>('optional');
  const [debrief, setDebrief] = useState<'on' | 'off'>('on');

  return (
    <div className="max-w-2xl bg-surface p-6">
      <ConfigSettingRow
        title="Availability"
        description="Whether learners can see and open this lesson."
      >
        <BinaryToggle
          label="Availability"
          value={availability}
          onValueChange={setAvailability}
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ]}
        />
      </ConfigSettingRow>
      <ConfigSettingRow
        title="Access"
        description="This module is free — set the module’s access first."
      >
        <BinaryToggle
          label="Access"
          value={access}
          disabledValue="subscription"
          onValueChange={setAccess}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'subscription', label: 'Subscription' },
          ]}
        />
      </ConfigSettingRow>
      <ConfigSettingRow
        title="Video watch"
        description="Whether learners must watch the video before the lesson counts as complete."
        warning="This lesson has no video, so a watch requirement cannot take effect."
      >
        <BinaryToggle
          label="Video watch"
          value={watch}
          onValueChange={setWatch}
          options={[
            { value: 'required', label: 'Required' },
            { value: 'optional', label: 'Optional' },
          ]}
        />
      </ConfigSettingRow>
      <ConfigSettingRow
        title="Debrief"
        description="Show the post-lesson debrief for this lesson."
      >
        <BinaryToggle
          label="Debrief"
          value={debrief}
          onValueChange={setDebrief}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </ConfigSettingRow>
    </div>
  );
};

export const ConfigTab: StoryObj = { render: () => <Rows /> };
