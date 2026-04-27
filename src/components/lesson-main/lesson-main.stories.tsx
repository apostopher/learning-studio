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
    state: { kind: 'no-video', lessonName: 'Crosswind landings' },
  },
};

export const ReadyFetching: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      videoId: 'v1',
      videoState: { status: 'fetching' },
    },
  },
};

export const ReadyRendering: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      videoId: 'v1',
      videoState: { status: 'rendering' },
    },
  },
};

export const ReadyError: Story = {
  args: {
    state: {
      kind: 'ready',
      lessonName: 'Crosswind landings',
      videoId: 'v1',
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
      videoId: 'v1',
      videoState: {
        status: 'ready',
        src: 'https://download.samplelib.com/mp4/sample-5s.mp4',
        tracks: [],
      },
    },
  },
};
