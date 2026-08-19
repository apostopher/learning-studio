// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LevelHistoryRow } from '#/data-hooks/use-user-levels';
import { UserCourseLevelRow } from '../user-course-level-row';

const history: LevelHistoryRow[] = [
  {
    id: 1,
    level: 'advanced',
    source: 'admin',
    message: 'Cleared for advanced ops after the check ride.',
    note: 'Confirmed with the chief instructor.',
    changedBy: 'admin-user-id',
    createdAt: new Date('2026-01-05T00:00:00Z'),
  },
];

describe('UserCourseLevelRow', () => {
  it('labels the level select with the course it belongs to', () => {
    render(
      <UserCourseLevelRow
        courseName="Advanced Aerial Photography"
        level="intermediate"
        history={[]}
        historyOpen={false}
        historyLoading={false}
        saving={false}
        onToggleHistory={vi.fn()}
        onLevelChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('combobox', {
        name: 'Level in Advanced Aerial Photography',
      }),
    ).toBeTruthy();
  });

  it('shows each history row’s message and note when the disclosure is open', () => {
    render(
      <UserCourseLevelRow
        courseName="Advanced Aerial Photography"
        level="advanced"
        history={history}
        historyOpen={true}
        historyLoading={false}
        saving={false}
        onToggleHistory={vi.fn()}
        onLevelChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Cleared for advanced ops after the check ride\./),
    ).toBeTruthy();
    expect(
      screen.getByText(/Confirmed with the chief instructor\./),
    ).toBeTruthy();
  });

  it('hides history rows until the disclosure is opened', () => {
    render(
      <UserCourseLevelRow
        courseName="Advanced Aerial Photography"
        level="advanced"
        history={history}
        historyOpen={false}
        historyLoading={false}
        saving={false}
        onToggleHistory={vi.fn()}
        onLevelChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(/Cleared for advanced ops after the check ride\./),
    ).toBeNull();
  });
});
