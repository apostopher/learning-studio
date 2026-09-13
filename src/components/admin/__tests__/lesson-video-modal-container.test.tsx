// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playLessonAtom } from '#/atoms/admin';
import type { EditorBoardModule } from '#/lib/admin-schemas';

/**
 * The consumer under test is the playback hook: what the modal hands it is
 * what goes on the wire (see use-lesson-video-playback-fetch.test.tsx), so
 * the hook is stubbed to record its arguments rather than fetch.
 */
const playbackArgs = vi.fn();
vi.mock('#/data-hooks/use-lesson-video-playback', () => ({
  useLessonVideoPlayback: (...args: unknown[]) => {
    playbackArgs(...args);
    return { isFetched: false, isError: false, error: null, data: undefined };
  },
}));
// The player attaches media in an effect; nothing here reaches a ready state.
vi.mock('../lesson-config/video-preview', () => ({
  VideoPreview: () => <div data-testid="preview" />,
}));

import { LessonVideoModalContainer } from '../lesson-video-modal-container';

/**
 * Two courses' modules, as the org editor hands them (flattened across the
 * rail), both teaching lesson 10. The modal looks the lesson up by id for
 * its name only; WHICH course to resolve playback in cannot come from this
 * list — it is whatever column the tile was pressed in.
 */
const MODULES: EditorBoardModule[] = [
  {
    id: 3,
    name: 'Approaches',
    slug: 'approaches',
    rank: 1,
    requiredSubscriptions: [],
    sequentialLessons: false,
    imageUrlAvif: null,
    imageUrlWebp: null,
    dependsOn: [],
    learnerCount: 0,
    lessons: [
      {
        id: 10,
        name: 'Crosswind landings',
        slug: 'crosswind-landings',
        rank: 1,
        isAvailable: true,
        hasDebrief: false,
        needsVideoWatch: false,
        requiredSubscriptions: [],
        levels: [],
        isConfigured: true,
        quizQuestionCount: 0,
        dependsOn: [],
      },
    ],
  },
];

function renderModal(play: { lessonId: number; courseId: number } | null) {
  const store = createStore();
  store.set(playLessonAtom, play);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return render(<LessonVideoModalContainer modules={MODULES} />, { wrapper });
}

beforeEach(() => playbackArgs.mockClear());

describe('LessonVideoModalContainer', () => {
  /**
   * Task 6b: the playback route guards on, and signs with, the course the
   * client names — it no longer infers one from the lesson. The tile that
   * opened this modal said which course it was pressed in; that is the
   * course the hook must be asked for, verbatim.
   *
   * Mutant seen RED: `useLessonVideoPlayback({ lessonId: play.lessonId,
   * courseId: 0 }, …)` — the shape the old id-only atom would force, with
   * the course filled in by a guess. `modules` carries no course id at all,
   * so no guess from it can reproduce the seeded 7.
   */
  it('asks for playback of the lesson in the course the tile named', () => {
    renderModal({ lessonId: 10, courseId: 7 });

    expect(playbackArgs).toHaveBeenCalledWith(
      { lessonId: 10, courseId: 7 },
      true,
    );
  });

  it('asks for nothing while closed', () => {
    renderModal(null);

    expect(playbackArgs).toHaveBeenCalledWith(null, false);
  });
});
