import { useUpdateLessonConfig } from '#/data-hooks/use-update-lesson-config';
import type { BoardLesson, BoardModule } from '@/lib/admin-schemas';
import { BinaryToggle } from './binary-toggle';
import {
  type AccessValue,
  type AvailabilityValue,
  accessSubscriptions,
  accessValue,
  availabilityValue,
  type DebriefValue,
  debriefValue,
  debriefWarning,
  isSubscriptionDisabled,
  isVideoWatchRequiredDisabled,
  type VideoWatchValue,
  videoWatchValue,
  videoWatchWarning,
} from './config-mappings';
import { ConfigSettingRow } from './config-setting-row';

interface ConfigSectionContainerProps {
  courseId: number;
  lesson: BoardLesson;
  module: BoardModule;
}

/**
 * Config tab: availability / access / video watch / debrief toggles, each
 * auto-saving on change.
 *
 * Video watch sits before Debrief to follow the learner's own sequence — watch
 * the video, then get the debrief.
 */
export const ConfigSectionContainer = ({
  courseId,
  lesson,
  module: mod,
}: ConfigSectionContainerProps) => {
  const updateConfig = useUpdateLessonConfig(courseId);
  const subscriptionDisabled = isSubscriptionDisabled(mod);

  return (
    <div className="flex flex-col">
      <ConfigSettingRow
        title="Availability"
        description="Whether learners can see and open this lesson."
      >
        <BinaryToggle<AvailabilityValue>
          label="Availability"
          value={availabilityValue(lesson)}
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { isAvailable: next === 'public' },
            })
          }
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ]}
        />
      </ConfigSettingRow>

      <ConfigSettingRow
        title="Access"
        description={
          subscriptionDisabled
            ? 'This module is free — set the module’s access first.'
            : 'Free for everyone, or limited to the module’s subscriptions.'
        }
      >
        <BinaryToggle<AccessValue>
          label="Access"
          value={accessValue(lesson)}
          disabledValue={subscriptionDisabled ? 'subscription' : undefined}
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { requiredSubscriptions: accessSubscriptions(next, mod) },
            })
          }
          options={[
            { value: 'free', label: 'Free' },
            { value: 'subscription', label: 'Subscription' },
          ]}
        />
      </ConfigSettingRow>

      <ConfigSettingRow
        title="Video watch"
        description="Whether learners must watch the video before the lesson counts as complete."
        warning={videoWatchWarning(lesson) ?? undefined}
      >
        <BinaryToggle<VideoWatchValue>
          label="Video watch"
          value={videoWatchValue(lesson)}
          disabledValue={
            isVideoWatchRequiredDisabled(lesson) ? 'required' : undefined
          }
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { needsVideoWatch: next === 'required' },
            })
          }
          options={[
            { value: 'required', label: 'Required' },
            { value: 'optional', label: 'Optional' },
          ]}
        />
      </ConfigSettingRow>

      <ConfigSettingRow
        title="Debrief"
        description="Show the post-lesson debrief for this lesson."
        warning={debriefWarning(lesson) ?? undefined}
      >
        <BinaryToggle<DebriefValue>
          label="Debrief"
          value={debriefValue(lesson)}
          onValueChange={(next) =>
            updateConfig.mutate({
              lessonId: lesson.id,
              patch: { hasDebrief: next === 'on' },
            })
          }
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </ConfigSettingRow>
    </div>
  );
};
