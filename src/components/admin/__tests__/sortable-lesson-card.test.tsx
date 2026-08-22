// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';

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

describe('SortableLessonCard', () => {
  it('hands the card a quickshot built for this course', () => {
    const { getByText } = render(
      <SortableLessonCard courseId={7} lesson={lesson} module={mod} />,
    );

    expect(cardProps.mock.calls[0][0].quickshotSlot).toBeTruthy();
    // And the courseId travelled with it — a quickshot wired to the wrong
    // course would patch the right lesson through the wrong cache key.
    expect(getByText('quickshot for course 7')).toBeTruthy();
  });
});
