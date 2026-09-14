// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorBoardLesson } from '#/lib/admin-schemas';

// ClampedText measures with `useRef`, and react-compiler nulls the hook
// dispatcher for this repo's components under vitest — rendering it here fails
// before any assertion runs. Stubbed to a plain span, matching the pattern
// used in `lesson-card.test.tsx`.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { BorrowedLessonList } from '../borrowed-lesson-list';

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
  dependsOn: [],
  ...over,
});

describe('BorrowedLessonList', () => {
  it('draws each lesson read-only, with duplicate chips only where flagged', () => {
    // Mutant: `BorrowedLessonList` hands its cards `dragHandleProps` (making
    // them draggable) or drops the `alsoIn` lookup for the wrong lesson.
    // This assertion fails against either mutant: the grip button would
    // resolve, or the chip text would be missing/misplaced.
    render(
      <BorrowedLessonList
        lessons={[
          lesson({ id: 1, name: 'Crosswind landings' }),
          lesson({ id: 2, name: 'Weather briefing' }),
        ]}
        alsoIn={new Map([[1, ['Weather']]])}
      />,
    );

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
});
