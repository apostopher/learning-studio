// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The card is the consumer of what this container decides; recorded rather
// than rendered, since its own registration has its own suite.
const card = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../library-lesson-card-container', () => ({
  LibraryLessonCardContainer: (props: unknown) => {
    card.render(props);
    return <div />;
  },
}));
// What is being dragged right now — `null` at rest.
const drag = vi.hoisted(() => ({ activeType: null as string | null }));
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: () => {},
    isOver: false,
    active: drag.activeType
      ? { data: { current: { type: drag.activeType } } }
      : null,
  }),
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  verticalListSortingStrategy: () => null,
}));

import type { LibraryLesson } from '#/lib/admin-schemas';
import { LibraryUntitledContainer } from '../library-untitled-container';

const lesson = (id: number): LibraryLesson => ({
  id,
  name: `L${id}`,
  slug: `l-${id}`,
  isConfigured: true,
  isAvailable: true,
  courseCount: 0,
  courseIds: [],
  videoProvider: null,
  // Deliberately NOT null: the card must be told the bucket it renders
  // from, never left to read this column off its own payload.
  disciplineModuleId: 99,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
});

beforeEach(() => {
  card.render.mockClear();
  drag.activeType = null;
});

describe('LibraryUntitledContainer', () => {
  it('hands each card the root bucket (null) and keeps it sortable', () => {
    render(
      <LibraryUntitledContainer
        disciplineId={4}
        lessons={[lesson(1), lesson(2)]}
      />,
    );
    expect(card.render).toHaveBeenCalledTimes(2);
    expect(card.render).toHaveBeenCalledWith(
      expect.objectContaining({
        lesson: expect.objectContaining({ id: 1 }),
        disciplineId: 4,
        boxId: null,
      }),
    );
    // Sortable by the card's default — never switched off for a discipline.
    expect(
      card.render.mock.calls.every(
        ([props]) => (props as { sortable?: boolean }).sortable !== false,
      ),
    ).toBe(true);
  });

  it('invites a drop on an empty shelf only while a library lesson is dragged', () => {
    const { rerender } = render(
      <LibraryUntitledContainer disciplineId={4} lessons={[]} />,
    );
    expect(screen.queryByText(/Drop here/)).toBeNull();

    // A module drag can never land here, so it gets no invitation.
    drag.activeType = 'library-module';
    rerender(<LibraryUntitledContainer disciplineId={4} lessons={[]} />);
    expect(screen.queryByText(/Drop here/)).toBeNull();

    drag.activeType = 'library-lesson';
    rerender(<LibraryUntitledContainer disciplineId={4} lessons={[]} />);
    expect(
      screen.getByText('Drop here to take it out of its module'),
    ).toBeTruthy();
  });
});
