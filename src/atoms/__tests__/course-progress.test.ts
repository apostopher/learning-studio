// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { createStore } from 'jotai';
import { queryClientAtom } from 'jotai-tanstack-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../hooks/data/keys';
import { milestones } from '../../lib/course-milestones';
import {
  lessonPercentsAtomFamily,
  modulePercentsAtomFamily,
} from '../course-progress';

const SLUG = 'test-course';

function setup(
  progress: Record<string, number[]> | undefined,
  details:
    | {
        modules: {
          id: number;
          lessons: { videoId: string | null }[];
        }[];
      }
    | undefined,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (progress) {
    queryClient.setQueryData(queryKeys.courseProgress(SLUG), {
      progressByVideo: progress,
      watchHistory: {},
    });
  }
  if (details) {
    queryClient.setQueryData(queryKeys.courseDetails(SLUG), details);
  }
  const store = createStore();
  store.set(queryClientAtom, queryClient);
  return store;
}

describe('lessonPercentsAtomFamily', () => {
  it('returns empty object when no progress data is cached', () => {
    const store = setup(undefined, undefined);
    expect(store.get(lessonPercentsAtomFamily(SLUG))).toEqual({});
  });

  it('returns 100 for a video with every milestone hit', () => {
    const store = setup({ 'vid-1': [...milestones] }, undefined);
    expect(store.get(lessonPercentsAtomFamily(SLUG))['vid-1']).toBe(100);
  });

  it('floors partial progress to the nearest whole percent', () => {
    // 8/16 milestones = 50%
    const half = milestones.slice(0, 8);
    const store = setup({ 'vid-1': half }, undefined);
    expect(store.get(lessonPercentsAtomFamily(SLUG))['vid-1']).toBe(50);
  });

  it('returns 0 for a video with no matching milestones', () => {
    const store = setup({ 'vid-1': [7] }, undefined);
    expect(store.get(lessonPercentsAtomFamily(SLUG))['vid-1']).toBe(0);
  });
});

describe('modulePercentsAtomFamily', () => {
  it('averages lesson percents across a module', () => {
    const full = [...milestones];
    const half = milestones.slice(0, 8);
    const store = setup(
      { 'v-a': full, 'v-b': half },
      {
        modules: [
          {
            id: 1,
            lessons: [{ videoId: 'v-a' }, { videoId: 'v-b' }],
          },
        ],
      },
    );
    // (100 + 50) / 2 = 75
    expect(store.get(modulePercentsAtomFamily(SLUG))[1]).toBe(75);
  });

  it('returns 0 for an empty module', () => {
    const store = setup({}, { modules: [{ id: 5, lessons: [] }] });
    expect(store.get(modulePercentsAtomFamily(SLUG))[5]).toBe(0);
  });

  it('treats lessons without videoId as 0 in the average', () => {
    const full = [...milestones];
    const store = setup(
      { 'v-a': full },
      {
        modules: [
          {
            id: 2,
            lessons: [{ videoId: 'v-a' }, { videoId: null }],
          },
        ],
      },
    );
    // (100 + 0) / 2 = 50
    expect(store.get(modulePercentsAtomFamily(SLUG))[2]).toBe(50);
  });
});
