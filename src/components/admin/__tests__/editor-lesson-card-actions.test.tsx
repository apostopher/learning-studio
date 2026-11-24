// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playLessonAtom } from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import type {
  BoardLesson,
  EditorBoardModule,
  OrgLibrary,
} from '#/lib/admin-schemas';

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
  // The quickshot chips this card now draws reach for the shared tooltip
  // popup and the shared class helper. Stubbed rather than added to the
  // component graph: this suite is about remove-versus-delete, and a real
  // Base UI tooltip needs a provider it has no reason to mount.
  IconButtonTooltip: ({ label }: { label: string }) => <span>{label}</span>,
  iconButtonClass: () => '',
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EditorLessonCardContainer } from '../editor-lesson-card-container';

const LESSON_ID = 10;
const MODULE_ID = 3;

/**
 * The card takes the whole module, not an id and a name: the padlock reads
 * `module.requiredSubscriptions` to decide whether access is editable, the
 * same way the per-course board's card does. Free here, so the padlock is
 * locked open unless a test passes a paid module.
 */
const MODULE: EditorBoardModule = {
  id: MODULE_ID,
  name: 'Fundamentals',
  slug: 'fundamentals',
  rank: 1,
  requiredSubscriptions: [],
  sequentialLessons: false,
  imageUrlAvif: null,
  imageUrlWebp: null,
  dependsOn: [],
  learnerCount: 0,
  owner: { id: MODULE_ID, name: 'Fundamentals' },
  otherCourseCount: 0,
  lessons: [],
};

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
  version: '1.0',
  disciplineVersion: '1.0',
  contentUpdatedAt: new Date(0),
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
      modules: [],
      untitled: [
        {
          id: LESSON_ID,
          name: 'Stalls',
          slug: 'stalls',
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

const fetchMock = vi.fn();

function renderCard(
  over: Partial<BoardLesson> = {},
  module: EditorBoardModule = MODULE,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(dataKeys.orgLibrary(), LIBRARY);
  const store = createStore();
  render(
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <EditorLessonCardContainer
          lesson={{ ...lesson, ...over }}
          module={module}
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

  it('offers no delete-everywhere control: that lives in the library', () => {
    // The bin was replaced by the padlock; deleting a lesson everywhere is
    // done from the library card only.
    renderCard();

    expect(
      document.querySelector('[aria-label="Delete lesson everywhere"]'),
    ).toBeNull();
  });

  /**
   * Task 6b: the editor rail holds SEVERAL courses' columns, and the same
   * lesson can sit in two of them. The preview modal asks the playback route
   * for the lesson in one named course (guarded and signed per course), so
   * the tile has to say which column it was pressed in.
   *
   * Mutant seen RED: the old id-only atom — the modal then has to guess a
   * course, which is exactly the inference the route no longer does.
   */
  it('opens the preview for this lesson in the column’s course', async () => {
    const { store } = renderCard();

    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Play Stalls video"]',
        ) as HTMLButtonElement,
      );
    });

    expect(store.get(playLessonAtom)).toEqual({
      lessonId: LESSON_ID,
      courseId: 7,
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

/**
 * The eye publishes or drafts the lesson. Asserted on the PATCH the server
 * receives, not on the card: an eye wired to nothing still renders and
 * still flips its icon optimistically if a cache write is all that happens.
 */
describe('EditorLessonCardContainer — visibility', () => {
  const patchBodies = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url) === `/api/admin/lessons/${LESSON_ID}`)
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

  it('hides a visible lesson through the config mutation', async () => {
    renderCard({ isAvailable: true });
    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Visible to students. Hide it"]',
        ) as HTMLButtonElement,
      );
    });
    expect(patchBodies()).toEqual([{ isAvailable: false }]);
  });

  it('shows a draft lesson through the config mutation', async () => {
    renderCard({ isAvailable: false });
    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Hidden from students. Show it"]',
        ) as HTMLButtonElement,
      );
    });
    expect(patchBodies()).toEqual([{ isAvailable: true }]);
  });

  it('passes the in-flight state to the eye', async () => {
    renderCard({ isAvailable: true });
    // Hold the PATCH open so the mutation stays pending.
    fetchMock.mockImplementation((url: string) =>
      String(url) === `/api/admin/lessons/${LESSON_ID}`
        ? new Promise(() => {})
        : Promise.resolve({ ok: true, status: 200, json: async () => LIBRARY }),
    );
    await act(async () => {
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Visible to students. Hide it"]',
        ) as HTMLButtonElement,
      );
    });
    // TanStack Query batches observer updates onto a later tick, so the
    // pending label lands after the click's act() has already resolved.
    await waitFor(() =>
      expect(
        document.querySelector('[aria-label="Updating visibility of Stalls…"]'),
      ).not.toBeNull(),
    );
  });
});

/**
 * The padlock is the paid/free toggle that replaced the FREE chip. Asserted on
 * the PATCH body, since a padlock wired to a no-op renders identically.
 */
describe('EditorLessonCardContainer — access padlock', () => {
  const PAID_MODULE: EditorBoardModule = {
    ...MODULE,
    requiredSubscriptions: ['rpoc'],
  };
  const patchBodies = () =>
    fetchMock.mock.calls
      .filter(([url]) => String(url) === `/api/admin/lessons/${LESSON_ID}`)
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
  const padlock = (name: string) =>
    document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);

  it('makes a free lesson paid with the module’s subscriptions', async () => {
    renderCard({ requiredSubscriptions: [] }, PAID_MODULE);
    const button = padlock(
      'Free: anyone enrolled sees this lesson. Make it paid',
    );
    expect(button?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(button as HTMLButtonElement);
    });

    expect(patchBodies()).toEqual([{ requiredSubscriptions: ['rpoc'] }]);
  });

  it('makes a paid lesson free', async () => {
    renderCard({ requiredSubscriptions: ['rpoc'] }, PAID_MODULE);
    const button = padlock(
      'Paid: only subscribers see this lesson. Make it free',
    );
    expect(button?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      fireEvent.click(button as HTMLButtonElement);
    });

    expect(patchBodies()).toEqual([{ requiredSubscriptions: [] }]);
  });

  it('stays inert in a free module and says why', async () => {
    renderCard();
    const button = padlock(
      'This module is free, so its lessons cannot be paid. Set the module’s access first.',
    );
    expect(button?.getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      fireEvent.click(button as HTMLButtonElement);
    });

    expect(patchBodies()).toEqual([]);
  });
});
