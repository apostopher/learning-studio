// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteLessonAtom } from '#/atoms/admin';
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

import { DELETE_UNAVAILABLE_REASON } from '../lesson-card-labels';
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
  lessons: [lesson],
};

/** Three courses teach this lesson — the number the confirmation must name. */
const LIBRARY: OrgLibrary = {
  disciplines: [
    {
      id: 4,
      name: 'Fixed wing',
      slug: 'fixed-wing',
      lessons: [
        {
          id: 10,
          name: 'Crosswind landings',
          slug: 'crosswind-landings',
          isConfigured: true,
          isAvailable: true,
          courseCount: 3,
        },
      ],
    },
  ],
  untitled: [],
};

/** Renders the card, optionally with the org library already in cache. */
function renderCard(library?: OrgLibrary) {
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
    <SortableLessonCard courseId={7} lesson={lesson} module={mod} />,
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
   * This board knows one course; deleting a lesson ends it in every course.
   * The count therefore has to come from the org library, and it has to be the
   * REAL one — the confirmation's whole job is to state the blast radius.
   *
   * Mutant seen RED: `courseCount: 0` passed instead of the library's value.
   * That compiles, renders, opens the dialog, and makes it say "is not in any
   * course yet" about a lesson sitting in a module on this very board.
   */
  it('opens the confirmation with the real course count, not a placeholder', async () => {
    const { store } = renderCard(LIBRARY);
    const onDelete = cardProps.mock.calls[0][0].onDelete as () => void;

    await act(async () => {
      onDelete();
    });

    expect(store.get(deleteLessonAtom)).toEqual({
      id: 10,
      name: 'Crosswind landings',
      courseCount: 3,
      // This board has NO remove control, and the confirmation is told so —
      // otherwise its copy would send the reader hunting for a button that is
      // nowhere on this screen.
      removeControlLabel: null,
    });
  });

  /**
   * Mutant seen RED: `courseCount ?? 0` in place of the null guard — the card
   * then offers a delete whose confirmation understates (indeed denies) the
   * blast radius while the library is still loading.
   */
  it('opens no confirmation while the course count is unknown', () => {
    renderCard();

    expect(cardProps.mock.calls[0][0].onDelete).toBeUndefined();
  });

  /**
   * Withholding the control is right; withholding it silently is not. Every
   * locked or unavailable control in this project states its reason, visibly
   * and in its accessible name.
   *
   * Mutant seen RED: `deleteUnavailableReason` not passed — the button simply
   * disappears while the library loads and reappears with no explanation.
   */
  it('says why deleting is unavailable rather than vanishing', () => {
    renderCard();

    const reason = cardProps.mock.calls[0][0].deleteUnavailableReason;
    expect(reason).toBe(DELETE_UNAVAILABLE_REASON);
    expect(reason).toMatch(/how many courses/i);
  });

  /**
   * This board never removes a placement — that is the editor's job — so the
   * confirmation must not describe a control it does not have.
   *
   * Mutant seen RED: `removeControlLabel: removeLessonLabel(lesson.name,
   * mod.name)` passed here, copying the editor card. It compiles, and the
   * dialog then quotes a button nobody on this screen can find.
   */
  it('tells the confirmation this surface has no remove control', async () => {
    const { store } = renderCard(LIBRARY);
    const onDelete = cardProps.mock.calls[0][0].onDelete as () => void;

    await act(async () => {
      onDelete();
    });

    expect(store.get(deleteLessonAtom)?.removeControlLabel).toBeNull();
  });
});
