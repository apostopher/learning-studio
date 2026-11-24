// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLessonIdAtom } from '#/atoms/admin';
import type { BoardModule } from '#/lib/admin-schemas';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('#/data-hooks/use-course-credentials', () => ({
  useCourseCredentials: () => ({
    data: [{ provider: 'mux', configured: true }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('../lesson-config/video-preview', () => ({
  VideoPreview: () => <div data-testid="preview" />,
}));
vi.mock('../lesson-config/credential-flow-container', () => ({
  CredentialFlowContainer: () => null,
}));
vi.mock('../lesson-config/config-section-container', () => ({
  ConfigSectionContainer: () => null,
}));
vi.mock('../sectioned-config-modal', () => ({
  SectionedConfigModal: (p: {
    headerActions?: ReactNode;
    sections: Record<string, ReactNode>[];
  }) => (
    <>
      {p.headerActions}
      {/* Everything the Content section hands over, a footer included. */}
      {Object.values(p.sections[0])}
    </>
  ),
}));

import { LessonConfigDialogContainer } from '../lesson-config-dialog-container';

const MODULE: BoardModule = {
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
      videoProvider: 'mux',
      videoRef: 'abc',
      // Disciplines is ahead: the sentence is about the course's version.
      version: '1.0',
      disciplineVersion: '1.4',
      contentUpdatedAt: new Date(0),
    },
  ],
};

function open(mod: BoardModule) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    return new Response(null, { status: 404 });
  });
  const store = createStore();
  store.set(configureLessonIdAtom, 10);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <LessonConfigDialogContainer courseId={7} modules={[mod]} />
      </Provider>
    </QueryClientProvider>,
  );
  return requests;
}
afterEach(() => vi.unstubAllGlobals());

describe("a course's Configure lesson, Content tab", () => {
  it("plays the course's version, says where to edit it, and edits nothing", async () => {
    const requests = open(MODULE);
    expect(
      screen.getByText('Content is v1.0. Edit it in Disciplines.'),
    ).toBeTruthy();
    expect(screen.getByTestId('preview')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('form')).toBeNull();
    await vi.waitFor(() =>
      expect(requests).toEqual([
        '/api/admin/lessons/10/video-playback?courseId=7&source=course&lang=en',
      ]),
    );
    expect(screen.queryByText(/has no video/)).toBeNull();
  });

  it("says so when the course's version has no video", () => {
    open({
      ...MODULE,
      lessons: [{ ...MODULE.lessons[0], videoProvider: null, videoRef: null }],
    });
    expect(screen.getByText('v1.0 has no video.')).toBeTruthy();
  });
});
