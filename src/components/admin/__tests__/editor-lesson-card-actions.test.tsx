// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteLessonAtom } from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import type { BoardLesson, OrgLibrary } from '#/lib/admin-schemas';

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

// ClampedText measures with `useRef`, and react-compiler nulls the hook
// dispatcher for this repo's presentational components under vitest.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

// Base UI's Tooltip.Trigger needs a provider and swallows `disabled`; a plain
// button carrying the same accessible name is all these tests click.
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
    disabled,
    children,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EditorLessonCardContainer } from '../editor-lesson-card-container';

const LESSON_ID = 10;
const MODULE_ID = 3;

const lesson: BoardLesson = {
  id: LESSON_ID,
  name: 'Stalls',
  slug: 'stalls',
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

/** Three courses teach this lesson — the number the confirmation must name. */
const LIBRARY: OrgLibrary = {
  disciplines: [
    {
      id: 4,
      name: 'Fixed wing',
      slug: 'fixed-wing',
      lessons: [
        {
          id: LESSON_ID,
          name: 'Stalls',
          slug: 'stalls',
          isConfigured: true,
          isAvailable: true,
          courseCount: 3,
        },
      ],
    },
  ],
  untitled: [],
};

const fetchMock = vi.fn();

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(dataKeys.orgLibrary(), LIBRARY);
  const store = createStore();
  render(
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <EditorLessonCardContainer
          lesson={lesson}
          moduleId={MODULE_ID}
          moduleName="Fundamentals"
          courseId={7}
        />
      </Provider>
    </QueryClientProvider>,
  );
  return { store };
}

/** Every URL `fetch` was asked for, in order. */
const requestedUrls = () => fetchMock.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => LIBRARY,
  });
  vi.stubGlobal('fetch', fetchMock);
});

/**
 * Remove and Delete sit two icons apart on the same card and do very different
 * things. These assert on the DB-facing call each one actually makes — the
 * placement endpoint versus the lesson endpoint — because a card whose remove
 * button was wired to `useDeleteLesson` would still render, still type-check,
 * still fire on click, and would quietly destroy the lesson in every course.
 */
describe('EditorLessonCardContainer — remove is not delete', () => {
  it('removes only the placement, hitting the module-lesson endpoint', async () => {
    // Mutant seen RED: `onRemove` calls `useDeleteLesson().mutate(lesson.id)`.
    // The click still happens and the card still renders; only the URL differs.
    const { store: _store } = renderCard();

    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Remove Stalls from Fundamentals"]',
        ) as HTMLButtonElement,
      );
    });

    expect(requestedUrls()).toContain(
      `/api/admin/modules/${MODULE_ID}/lessons/${LESSON_ID}`,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('never touches the lesson-delete endpoint when removing', async () => {
    // Mutant seen RED: as above. Stated separately because "called the right
    // endpoint" and "called ONLY the right endpoint" are different claims, and
    // a card wired to both would pass the first.
    renderCard();

    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Remove Stalls from Fundamentals"]',
        ) as HTMLButtonElement,
      );
    });

    expect(requestedUrls()).not.toContain(`/api/admin/lessons/${LESSON_ID}`);
  });

  it('deletes nothing on click, and hands the confirmation the course count', async () => {
    // Mutant seen RED (two of them): `onDelete` calling `unlinkLesson.mutate`
    // — which fires a request and leaves the atom null; and
    // `courseCount: 1` hard-coded, which makes the dialog understate a
    // three-course blast radius.
    const { store } = renderCard();

    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Delete lesson everywhere"]',
        ) as HTMLButtonElement,
      );
    });

    // Deleting is confirmed first: the click may write nothing to the server.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get(deleteLessonAtom)).toEqual({
      id: LESSON_ID,
      name: 'Stalls',
      courseCount: 3,
    });
  });

  it('names the module in the remove control, not just "Remove"', async () => {
    // Mutant seen RED: `removeLabel` dropped, so the card falls back to the
    // generic "Remove from module" and the accessible name no longer says
    // which module — the one thing that distinguishes it from Delete.
    renderCard();

    expect(
      document.querySelector('[aria-label="Remove Stalls from Fundamentals"]'),
    ).not.toBeNull();
  });
});
