// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLessonIdAtom, editLibraryLessonIdAtom } from '#/atoms/admin';
import type { BoardModule, LibraryLesson } from '#/lib/admin-schemas';

/**
 * Both lesson dialogs preview a video through one section. The consumer is the
 * playback hook: the Disciplines dialog must ask it for the working copy it
 * edits, the course dialog for the version the course is on.
 */
const playback = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
);
vi.mock('#/data-hooks/use-lesson-video-playback', () => ({
  useLessonVideoPlayback: playback,
}));
vi.mock('#/data-hooks/use-course-credentials', () => ({
  useCourseCredentials: () => ({
    data: [{ provider: 'mux', configured: true }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('#/data-hooks/use-lesson-video', () => ({
  useLessonVideo: () => ({ data: null }),
}));
vi.mock('#/data-hooks/use-set-lesson-video', () => ({
  useSetLessonVideo: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
const library = vi.hoisted(() => ({ lesson: null as unknown }));
vi.mock('#/data-hooks/use-org-library', () => ({
  useOrgLibrary: () => ({
    data: { disciplines: [], untitled: [library.lesson] },
  }),
}));
vi.mock('../sectioned-config-modal', () => ({
  SectionedConfigModal: (p: { sections: { content: ReactNode }[] }) =>
    p.sections[0].content,
}));
vi.mock('../lesson-config/video-preview', () => ({ VideoPreview: () => null }));
vi.mock('../lesson-config/alternate-videos-container', () => ({
  AlternateVideosContainer: () => null,
}));
vi.mock('../lesson-config/version-notes-field-container', () => ({
  VersionNotesFieldContainer: () => null,
}));
vi.mock('../lesson-config/version-field-container', () => ({
  VersionFieldContainer: () => null,
}));
vi.mock('../lesson-config/captions-status-container', () => ({
  CaptionsStatusContainer: () => null,
}));
vi.mock('../lesson-config/credential-flow-container', () => ({
  CredentialFlowContainer: () => null,
}));
vi.mock('../lesson-config/material-section-container', () => ({
  MaterialSectionContainer: () => null,
}));
vi.mock('../lesson-config/material-save-button-container', () => ({
  MaterialSaveButtonContainer: () => null,
}));
vi.mock('../lesson-config/config-section-container', () => ({
  ConfigSectionContainer: () => null,
}));
vi.mock('../library-lesson-heading-container', () => ({
  LibraryLessonHeadingContainer: () => null,
}));

import { LessonConfigDialogContainer } from '../lesson-config-dialog-container';
import { LibraryLessonConfigDialogContainer } from '../library-lesson-config-dialog-container';

const CONTENT = {
  id: 10,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  isAvailable: true,
  isConfigured: true,
  hasDebrief: false,
  needsVideoWatch: false,
  requiredSubscriptions: [],
  levels: [],
  videoProvider: 'mux' as const,
  version: '1.0',
};
const LIBRARY_LESSON: LibraryLesson = {
  ...CONTENT,
  courseCount: 2,
  courseIds: [7, 8],
  disciplineModuleId: null,
};
const MODULES: BoardModule[] = [
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
    owner: { id: 7, name: 'Course' },
    otherCourseCount: 0,
    lessons: [
      {
        ...CONTENT,
        rank: 1,
        quizQuestionCount: 0,
        dependsOn: [],
        videoRef: 'abc',
        disciplineVersion: '1.0',
      },
    ],
  },
];

beforeEach(() => vi.clearAllMocks());

describe('lesson dialogs', () => {
  it('the Disciplines dialog previews the working copy', () => {
    library.lesson = LIBRARY_LESSON;
    const store = createStore();
    store.set(editLibraryLessonIdAtom, 10);
    const { container } = render(
      <Provider store={store}>
        <LibraryLessonConfigDialogContainer />
      </Provider>,
    );
    expect(playback.mock.calls.at(-1)).toEqual([
      { lessonId: 10, courseId: 7, source: 'discipline', lang: 'en' },
      true,
    ]);
    // Each course has its own version now, so no claim that they share it.
    expect(container.textContent).toContain(
      'Preview is signed with the first of the 2 courses teaching this lesson.',
    );
    expect(container.textContent).not.toContain('shared');
  });

  it("the course dialog previews the course's version", () => {
    const store = createStore();
    store.set(configureLessonIdAtom, 10);
    render(
      <Provider store={store}>
        <LessonConfigDialogContainer courseId={7} modules={MODULES} />
      </Provider>,
    );
    expect(playback.mock.calls.at(-1)).toEqual([
      { lessonId: 10, courseId: 7, source: 'course', lang: 'en' },
      true,
    ]);
  });
});
