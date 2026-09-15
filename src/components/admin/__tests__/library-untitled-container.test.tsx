// @vitest-environment jsdom
import { render } from '@testing-library/react';
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
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
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

beforeEach(() => card.render.mockClear());

describe('LibraryUntitledContainer', () => {
  it("hands each card the Untitled bucket (null) and keeps a discipline's cards sortable", () => {
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
        sortable: true,
      }),
    );
  });

  it('turns sorting off for the org-level column, whose cards keep no order', () => {
    render(
      <LibraryUntitledContainer
        disciplineId={0}
        lessons={[lesson(1)]}
        isOrgLevel
      />,
    );
    expect(card.render).toHaveBeenCalledWith(
      expect.objectContaining({ boxId: null, sortable: false }),
    );
  });
});
