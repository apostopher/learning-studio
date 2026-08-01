import type { Meta, StoryObj } from '@storybook/react-vite';
import { LessonMain } from './lesson-main';

const meta: Meta<typeof LessonMain> = {
  title: 'lesson-main/LessonMain',
  component: LessonMain,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof LessonMain>;

const noop = () => {};

export const CourseLoading: Story = {
  args: { state: { kind: 'course-loading' } },
};

export const CourseError: Story = {
  args: {
    state: {
      kind: 'course-error',
      message: 'Network unreachable',
      onRetry: noop,
    },
  },
};

export const NotFound: Story = {
  args: {
    state: { kind: 'not-found', lessonSlug: 'no-such-lesson' },
  },
};

export const NoVideo: Story = {
  args: {
    state: {
      kind: 'no-video',
      lessonName: 'Crosswind landings',
      lessonSlug: 'crosswind-landings',
      courseSlug: 'ppl',
      hasDebrief: true,
      videoExpected: false,
    },
  },
};

export const Locked: Story = {
  args: {
    state: {
      kind: 'locked',
      lessonName: 'Crosswind landings',
      courseSlug: 'itps-uas-remote',
      lock: {
        locked: true,
        reason: 'lesson',
        blockedBy: {
          lessonSlug: 'stabilized-approach',
          moduleSlug: 'approach-and-landing',
          lessonName: 'Stabilized approach',
        },
      },
    },
  },
};

export const LockedByModule: Story = {
  args: {
    state: {
      kind: 'locked',
      lessonName: 'Crosswind landings',
      courseSlug: 'itps-uas-remote',
      lock: {
        locked: true,
        reason: 'module',
        blockedBy: {
          moduleSlug: 'approach-and-landing',
          moduleName: 'Approach and landing',
        },
      },
    },
  },
};

export const ReadyFetching: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      lessonSlug: 'crosswind-landings',
      courseSlug: 'itps-uas-remote',
      hasDebrief: true,
      videoState: { status: 'fetching' },
    },
  },
};

export const ReadyRendering: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      lessonSlug: 'crosswind-landings',
      courseSlug: 'itps-uas-remote',
      hasDebrief: true,
      videoState: { status: 'rendering' },
    },
  },
};

export const ReadyError: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      lessonSlug: 'crosswind-landings',
      courseSlug: 'itps-uas-remote',
      hasDebrief: true,
      videoState: {
        status: 'error',
        message: 'Video lookup failed',
        onRetry: noop,
      },
    },
  },
};

export const ReadyPlaying: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      lessonSlug: 'crosswind-landings',
      courseSlug: 'itps-uas-remote',
      hasDebrief: true,
      videoState: {
        status: 'ready',
        src: 'https://download.samplelib.com/mp4/sample-5s.mp4',
        kind: 'file',
        tracks: [],
        captionsUnavailable: false,
        onRetry: noop,
      },
    },
  },
};
