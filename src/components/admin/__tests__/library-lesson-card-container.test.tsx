// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// dnd-kit needs a DndContext ancestor. The stub RECORDS what the card
// registers with, because the registration is what the editor's collision
// filters and `resolveDrop` consume.
const sortable = vi.hoisted(() => ({ useSortable: vi.fn() }));
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: (args: unknown) => {
    sortable.useSortable(args);
    return {
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isSorting: false,
      isDragging: false,
    };
  },
}));
// ClampedText measures with hooks that react-compiler nulls under vitest, and
// TooltipIconButton needs a Tooltip.Provider — both stubbed, matching the
// pattern in `module-accordion-item.test.tsx`.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick?: () => void;
  }) => (
    <button type="button" aria-label={label} onClick={onClick}>
      {label}
    </button>
  ),
}));
const tile = vi.hoisted(() => ({ received: vi.fn() }));
vi.mock('../lesson-video-tile', () => ({
  LessonVideoTile: (props: { posterUrl?: string | null }) => {
    tile.received(props.posterUrl);
    return <div />;
  },
}));
const postersHook = vi.hoisted(() => ({
  useDisciplineLessonPosters: vi.fn(
    (): { data: Record<string, string> | undefined } => ({ data: undefined }),
  ),
}));
vi.mock('#/data-hooks/use-discipline-lesson-posters', () => postersHook);

import { deleteLessonAtom, editLibraryLessonIdAtom } from '#/atoms/admin';
import { LibraryLessonCardContainer } from '../library-lesson-card-container';

const LESSON = {
  id: 42,
  name: 'Stalls',
  slug: 'stalls',
  isConfigured: true,
  isAvailable: true,
  courseCount: 2,
  courseIds: [],
  videoProvider: null,
  disciplineModuleId: null,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
};

beforeEach(() => {
  sortable.useSortable.mockClear();
  tile.received.mockClear();
  postersHook.useDisciplineLessonPosters.mockReturnValue({ data: undefined });
});

describe('LibraryLessonCardContainer', () => {
  /**
   * The editor's stage-two collision filters pick "the lessons of the box
   * the pointer is inside" by `data.disciplineModuleId`. Set from the CARD's
   * own `lesson.disciplineModuleId`, a stale payload column (the module was
   * deleted; the payload already re-bucketed the lesson under Untitled)
   * registered the card under a box it is not rendered in — contrary to the
   * walk-the-buckets rule. The container that renders the card says which
   * bucket it is rendering from, and THAT is what is registered.
   */
  it('registers the bucket it is rendered from, not the card’s own disciplineModuleId', () => {
    render(
      <Provider store={createStore()}>
        <LibraryLessonCardContainer
          lesson={{ ...LESSON, disciplineModuleId: 99 }}
          disciplineId={7}
          boxId={null}
        />
      </Provider>,
    );
    expect(sortable.useSortable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          type: 'library-lesson',
          lessonId: 42,
          disciplineId: 7,
          disciplineModuleId: null,
        },
      }),
    );
  });

  it('registers the module box it is rendered in', () => {
    render(
      <Provider store={createStore()}>
        <LibraryLessonCardContainer
          lesson={LESSON}
          disciplineId={7}
          boxId={12}
        />
      </Provider>,
    );
    expect(sortable.useSortable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disciplineModuleId: 12 }),
      }),
    );
  });

  /**
   * Org-level Untitled cards (no discipline) have no order to keep —
   * `resolveDrop` refuses every library-side target for them — but their
   * siblings still animated a reorder the drop would refuse. Sorting is off
   * for them (no droppable among siblings, so nothing displaces), while the
   * drag itself stays on: they must still link into a course.
   */
  it('turns sorting off but keeps the drag on when told it is not sortable', () => {
    render(
      <Provider store={createStore()}>
        <LibraryLessonCardContainer
          lesson={LESSON}
          disciplineId={0}
          boxId={null}
          sortable={false}
        />
      </Provider>,
    );
    expect(sortable.useSortable).toHaveBeenCalledWith(
      expect.objectContaining({
        disabled: { draggable: false, droppable: true },
      }),
    );
  });

  it('is sortable by default', () => {
    render(
      <Provider store={createStore()}>
        <LibraryLessonCardContainer
          lesson={LESSON}
          disciplineId={7}
          boxId={null}
        />
      </Provider>,
    );
    expect(sortable.useSortable).toHaveBeenCalledWith(
      expect.objectContaining({
        disabled: { draggable: false, droppable: false },
      }),
    );
  });

  it('opens the lesson-level editor for THIS lesson', () => {
    // The regression this pins: `LibraryLessonCard` accepted `onEdit` from the
    // day it was written and this container never passed it, so the pencil
    // never rendered and the library had no way to edit a lesson at all.
    // Asserting the atom holds this lesson's id — not merely that a button
    // exists — is what catches a hardcoded or wrong id reaching the modal.
    const store = createStore();
    render(
      <Provider store={store}>
        <LibraryLessonCardContainer
          lesson={LESSON}
          disciplineId={7}
          boxId={null}
        />
      </Provider>,
    );

    expect(store.get(editLibraryLessonIdAtom)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit lesson' }));
    expect(store.get(editLibraryLessonIdAtom)).toBe(42);
  });
  it("reads its shelf's posters once per discipline and hands the card THIS lesson's frame", () => {
    postersHook.useDisciplineLessonPosters.mockReturnValue({
      data: { '42': 'https://p/42.jpg', '7': 'https://p/7.jpg' },
    });
    render(
      <LibraryLessonCardContainer
        lesson={LESSON}
        disciplineId={4}
        boxId={null}
      />,
    );
    expect(postersHook.useDisciplineLessonPosters).toHaveBeenCalledWith(4);
    expect(tile.received).toHaveBeenLastCalledWith('https://p/42.jpg');
  });

  it('hands the card no frame while posters are unknown', () => {
    render(
      <LibraryLessonCardContainer
        lesson={LESSON}
        disciplineId={4}
        boxId={null}
      />,
    );
    expect(tile.received).toHaveBeenLastCalledWith(undefined);
  });
  it('opens the delete confirmation for THIS lesson with its own name and course count — the blast radius the dialog states', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <LibraryLessonCardContainer
          lesson={{ ...LESSON, courseCount: 3 }}
          disciplineId={7}
          boxId={null}
        />
      </Provider>,
    );
    expect(store.get(deleteLessonAtom)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete lesson' }));
    expect(store.get(deleteLessonAtom)).toEqual({
      id: 42,
      name: 'Stalls',
      courseCount: 3,
      // A library card has no "remove from module" control to point at.
      removeControlLabel: null,
    });
  });
});
