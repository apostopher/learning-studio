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
  it('labels the level select with the course it belongs to when editable', () => {
    render(
      <UserCourseLevelRow
        courseName="Advanced Aerial Photography"
        level="intermediate"
        history={[]}
        historyOpen={false}
        historyLoading={false}
        canEdit={true}
        canViewHistory={true}
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
        canEdit={true}
        canViewHistory={true}
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
        canEdit={true}
        canViewHistory={true}
        saving={false}
        onToggleHistory={vi.fn()}
        onLevelChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(/Cleared for advanced ops after the check ride\./),
    ).toBeNull();
  });

  it('renders the level as plain, reason-stating text without level:update', () => {
    render(
      <UserCourseLevelRow
        courseName="Advanced Aerial Photography"
        level="advanced"
        history={[]}
        historyOpen={false}
        historyLoading={false}
        canEdit={false}
        canViewHistory={true}
        saving={false}
        onToggleHistory={vi.fn()}
        onLevelChange={vi.fn()}
      />,
    );

    // No interactive select for a read-only actor.
    expect(screen.queryByRole('combobox')).toBeNull();
    // The current level and the reason it can't be changed are both real,
    // visible text — not a greyed-out control with no explanation.
    expect(screen.getByText('Advanced')).toBeTruthy();
    expect(screen.getByText('View only')).toBeTruthy();
  });

  it('hides the history disclosure without level:read', () => {
    render(
      <UserCourseLevelRow
        courseName="Advanced Aerial Photography"
        level="advanced"
        history={history}
        historyOpen={false}
        historyLoading={false}
        canEdit={true}
        canViewHistory={false}
        saving={false}
        onToggleHistory={vi.fn()}
        onLevelChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Show history')).toBeNull();
    expect(screen.queryByRole('button', { name: /history/i })).toBeNull();
  });
});
