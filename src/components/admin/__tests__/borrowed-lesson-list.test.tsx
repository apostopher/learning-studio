// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { updateLessonVersionAtom } from '#/atoms/admin';
import type { EditorBoardLesson } from '#/lib/admin-schemas';

// ClampedText measures with `useRef`, and react-compiler nulls the hook
// dispatcher for this repo's components under vitest — rendering it here fails
// before any assertion runs. Stubbed to a plain span, matching the pattern
// used in `lesson-card.test.tsx`.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

// The chip's real tooltip popup needs a provider.
vi.mock('../../ui/tooltip-icon-button', () => ({
  IconButtonTooltip: ({ label }: { label: string }) => <span>{label}</span>,
  iconButtonClass: () => '',
}));

import { BorrowedLessonList } from '../borrowed-lesson-list';

function renderList(
  props: Omit<ComponentProps<typeof BorrowedLessonList>, 'course'>,
) {
  const store = createStore();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <BorrowedLessonList
          course={{ id: 9, name: 'Borrowing course' }}
          {...props}
        />
      </Provider>
    </QueryClientProvider>,
  );
  return store;
}

const lesson = (over: Partial<EditorBoardLesson> = {}): EditorBoardLesson => ({
  id: 1,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  rank: 1,
  isAvailable: true,
  hasDebrief: false,
  needsVideoWatch: true,
  requiredSubscriptions: [],
  levels: [],
  isConfigured: true,
  quizQuestionCount: 0,
  version: '1.0',
  disciplineVersion: '1.0',
  contentUpdatedAt: new Date(0),
  dependsOn: [],
  ...over,
});

describe('BorrowedLessonList', () => {
  it('draws each lesson read-only, with duplicate chips only where flagged', () => {
    // Mutant: `BorrowedLessonList` hands its cards `dragHandleProps` (making
    // them draggable) or drops the `alsoIn` lookup for the wrong lesson.
    // This assertion fails against either mutant: the grip button would
    // resolve, or the chip text would be missing/misplaced.
    renderList({
      lessons: [
        lesson({ id: 1, name: 'Crosswind landings' }),
        lesson({ id: 2, name: 'Weather briefing' }),
      ],
      alsoIn: new Map([[1, ['Weather']]]),
    });

    expect(screen.getByText('Also in Weather')).toBeTruthy();
    // Only lesson 1 carries the chip — lesson 2 has no entry in `alsoIn`.
    expect(screen.getAllByText(/^Also in /)).toHaveLength(1);

    // No drag grip anywhere in the list — a borrowed module's lessons are
    // read-only, and a grip that refuses every drag is a control that looks
    // live and is not.
    expect(
      screen.queryByRole('button', { name: /Drag to reorder/ }),
    ).toBeNull();
    // No edit/remove/delete controls either — those all edit the module's
    // content, which belongs to its owner.
    expect(
      screen.queryByRole('button', { name: /Remove|Delete|Edit/ }),
    ).toBeNull();
  });

  it("updates the BORROWING course's version, its one live control", () => {
    const contentUpdatedAt = new Date('2026-11-24T09:38:00Z');
    const store = renderList({
      lessons: [
        lesson({ id: 1, disciplineVersion: '1.0' }),
        lesson({
          id: 2,
          name: 'Weather briefing',
          disciplineVersion: '1.1',
          contentUpdatedAt,
        }),
      ],
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'v1.0. Disciplines has v1.1. Update this lesson',
      }),
    );
    expect(store.get(updateLessonVersionAtom)).toEqual({
      courseId: 9,
      courseName: 'Borrowing course',
      lessonId: 2,
      lessonName: 'Weather briefing',
      from: '1.0',
      to: '1.1',
      contentUpdatedAt,
    });
  });
});
