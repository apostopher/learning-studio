// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playLessonAtom } from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import type { BoardLesson, BoardModule, OrgLibrary } from '#/lib/admin-schemas';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isSorting: false,
    isDragging: false,
  }),
}));

// The chips' own behaviour is covered by lesson-quickshot.test.tsx; here we
// only care that something reached the card, so the container is stubbed to
// avoid needing a QueryClient.
vi.mock('../lesson-quickshot-container', () => ({
  LessonQuickshotContainer: ({ courseId }: { courseId: number }) => (
    <span>quickshot for course {courseId}</span>
  ),
}));

/**
 * Captures what LessonCard was handed. Asserting on the card's props — rather
 * than on SortableLessonCard's own state — is what makes this fail if the
 * wiring is ever dropped: `quickshotSlot` is optional, so a card that stops
 * being given one still type-checks and still renders.
 */
const cardProps = vi.fn();
vi.mock('../lesson-card', () => ({
  LessonCard: (props: Record<string, unknown>) => {
    cardProps(props);
    return <div>{props.quickshotSlot as React.ReactNode}</div>;
  },
}));

import { SortableLessonCard } from '../sortable-lesson-card';

const lesson: BoardLesson = {
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
  version: '1.0',
  disciplineVersion: '1.0',
  contentUpdatedAt: new Date(0),
  dependsOn: [],
  videoProvider: 'mux',
  videoRef: 'ref',
};

const mod: BoardModule = {
  id: 3,
  name: 'Approaches',
  slug: 'approaches',
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: 1,
  requiredSubscriptions: ['associate'],
  dependsOn: [],
  sequentialLessons: true,
  learnerCount: 0,
  owner: { id: 3, name: 'Approaches' },
  otherCourseCount: 0,
  lessons: [lesson],
};

/** Three courses teach this lesson — the number the confirmation must name. */
const LIBRARY: OrgLibrary = {
  disciplines: [
    {
      id: 4,
      name: 'Fixed wing',
      slug: 'fixed-wing',
      modules: [],
      untitled: [
        {
          id: 10,
          name: 'Crosswind landings',
          slug: 'crosswind-landings',
          isConfigured: true,
          isAvailable: true,
          courseCount: 3,
          courseIds: [],
          version: '1.0',
          highestTaken: null,
          versionCourseCount: 0,
          contentUpdatedAt: new Date(0),
          videoProvider: null,
          disciplineModuleId: null,
          levels: [],
          requiredSubscriptions: [],
          hasDebrief: false,
          needsVideoWatch: false,
        },
      ],
    },
  ],
  untitled: [],
};

/** Renders the card, optionally with the org library already in cache. */
function renderCard(library?: OrgLibrary, module: BoardModule = mod) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  if (library) client.setQueryData(dataKeys.orgLibrary(), library);
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  const utils = render(
    <SortableLessonCard courseId={7} lesson={lesson} module={module} />,
    { wrapper },
  );
  return { ...utils, store };
}

beforeEach(() => {
  cardProps.mockClear();
});

describe('SortableLessonCard', () => {
  it('hands the card a quickshot built for this course', () => {
    const { getByText } = renderCard(LIBRARY);

    expect(cardProps.mock.calls[0][0].quickshotSlot).toBeTruthy();
    // And the courseId travelled with it — a quickshot wired to the wrong
    // course would patch the right lesson through the wrong cache key.
    expect(getByText('quickshot for course 7')).toBeTruthy();
  });

  /**
   * Deleting a lesson everywhere moved to the library card only; the bin on
   * this board was replaced by the paid/free padlock.
   */
  it('offers no delete on a course board', () => {
    renderCard(LIBRARY);

    expect(cardProps.mock.calls[0][0].onDelete).toBeUndefined();
    expect(cardProps.mock.calls[0][0].deleteUnavailableReason).toBeUndefined();
  });

  /**
   * Task 6b: the preview modal asks the playback route for this lesson IN a
   * course — the route guards on it and signs with its credentials, and no
   * longer infers one. This board is one course's board, so the play tile
   * hands the modal both halves.
   *
   * Mutant seen RED: `setPlayLesson({ lessonId: lesson.id, courseId: 0 })`
   * (or the old id-only atom) — the modal then names a course the lesson is
   * not in and the route answers 404 for a lesson that plainly has a video.
   */
  it('opens the preview for this lesson in THIS course', async () => {
    const { store } = renderCard(LIBRARY);
    const onPlay = cardProps.mock.calls[0][0].onPlay as () => void;

    await act(async () => {
      onPlay();
    });

    expect(store.get(playLessonAtom)).toEqual({ lessonId: 10, courseId: 7 });
  });
});

/**
 * The eye on this board publishes or drafts the lesson through the board's
 * own config mutation. Asserted on the PATCH that leaves the browser: a
 * `visibility` prop wired to a no-op would type-check and render the same.
 */
describe('SortableLessonCard — visibility', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('hides a visible lesson through the config mutation', async () => {
    renderCard(LIBRARY);
    const visibility = cardProps.mock.calls[0][0].visibility as {
      onToggle: () => void;
    };
    await act(async () => {
      visibility.onToggle();
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`/api/admin/lessons/${lesson.id}`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      isAvailable: false,
    });
  });

  it('starts with the eye idle', () => {
    renderCard(LIBRARY);
    expect(cardProps.mock.calls[0][0].visibility).toMatchObject({
      isPending: false,
    });
  });
});

/**
 * The padlock makes the lesson paid or free through the same config mutation.
 * Asserted on the PATCH that leaves the browser, not on the prop's shape.
 */
describe('SortableLessonCard — access padlock', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('makes a free lesson paid with its module’s subscriptions', async () => {
    renderCard(LIBRARY);
    const access = cardProps.mock.calls[0][0].access as {
      isPaid: boolean;
      onToggle: () => void;
    };
    expect(access.isPaid).toBe(false);

    await act(async () => {
      access.onToggle();
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`/api/admin/lessons/${lesson.id}`);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      requiredSubscriptions: ['associate'],
    });
  });

  it('locks the padlock in a free module, and says why', () => {
    renderCard(LIBRARY, { ...mod, requiredSubscriptions: [] });

    expect(cardProps.mock.calls[0][0].access.lockedReason).toMatch(
      /module is free/,
    );
  });
});
