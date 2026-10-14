// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
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
const IDLE = {
  isFetched: false,
  isPlaceholderData: false,
  isError: false,
  error: null,
  data: undefined,
  refetch: () => {},
};
const playbackArgs = vi.hoisted(() => vi.fn());
const playbackResult = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock('#/data-hooks/use-lesson-video-playback', () => ({
  useLessonVideoPlayback: (...args: unknown[]) => {
    playbackArgs(...args);
    return playbackResult.current;
  },
}));
// Stubbed to capture props: the real one mounts the shared player, which
// attaches media in an effect.
const preview = vi.hoisted(() =>
  vi.fn((_p: Record<string, unknown>) => <div data-testid="preview" />),
);
vi.mock('../lesson-config/video-preview', () => ({ VideoPreview: preview }));

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
    owner: { id: 3, name: 'Approaches' },
    otherCourseCount: 0,
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

const ready = {
  status: 'ready' as const,
  url: 'https://stream.mux.com/abc.m3u8?token=t',
  kind: 'hls' as const,
  expiresInSeconds: 3600,
  poster: null,
  captions: null,
  lang: 'en' as const,
  languages: ['en' as const, 'fr' as const],
};

beforeEach(() => {
  playbackArgs.mockClear();
  preview.mockClear();
  playbackResult.current = IDLE;
});

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
      { lessonId: 10, courseId: 7, lang: 'en' },
      true,
    );
  });

  it('asks for nothing while closed', () => {
    renderModal(null);

    expect(playbackArgs).toHaveBeenCalledWith(null, false);
  });

  it('re-queries playback in the language picked from the player', () => {
    playbackResult.current = { ...IDLE, isFetched: true, data: ready };
    renderModal({ lessonId: 10, courseId: 7 });

    const props = preview.mock.calls.at(-1)?.[0] as {
      onLanguageChange?: (code: string) => void;
    };
    act(() => props.onLanguageChange?.('fr'));

    expect(playbackArgs.mock.calls.at(-1)).toEqual([
      { lessonId: 10, courseId: 7, lang: 'fr' },
      true,
    ]);
  });

  /**
   * Mid-switch, the new language's key has not fetched (`isFetched` false)
   * and the hook serves the previous language as placeholder data. Falling
   * to "loading" there would unmount the player and lose the resume point
   * the placeholder exists to keep.
   */
  it('keeps playing the previous language while the new one loads', () => {
    playbackResult.current = {
      ...IDLE,
      isFetched: false,
      isPlaceholderData: true,
      data: ready,
    };
    renderModal({ lessonId: 10, courseId: 7 });

    expect(screen.getByTestId('preview')).toBeTruthy();
    expect(preview.mock.calls.at(-1)?.[0]).toMatchObject({ playback: ready });
    expect(screen.queryByText('Resolving playback…')).toBeNull();
  });
});
