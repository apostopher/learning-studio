import { useSetLessonVisibility } from '#/data-hooks/use-set-lesson-visibility';
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
  const setVisibility = useSetLessonVisibility();

  return (
    <div className="flex flex-col">
      <ConfigSettingRow
        title="Availability"
        description="Whether this course’s learners can see and open this lesson."
      >
        <BinaryToggle<AvailabilityValue>
          label="Availability"
          value={availabilityValue(lesson)}
          onValueChange={(next) =>
            setVisibility.mutate({
              courseId,
              lessonId: lesson.id,
              isVisible: next === 'public',
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
        description="Free, or paid. Shown on the lesson card as FREE or PAID."
      >
        <BinaryToggle<AccessValue>
          label="Access"
          value={accessValue(lesson)}
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
        description="Learners always see the debrief. Required counts it toward the lesson score; optional leaves the score to the video and quiz."
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
            { value: 'on', label: 'Required' },
            { value: 'off', label: 'Optional' },
          ]}
        />
      </ConfigSettingRow>
    </div>
  );
};
