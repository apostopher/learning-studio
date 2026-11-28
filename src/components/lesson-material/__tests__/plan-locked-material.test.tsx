// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/components/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { PlanLockedMaterial } from '../plan-locked-material';

const tabs = {
  hasQuiz: true,
  hasBodyText: true,
  extraTab: 'testThis' as const,
};

describe('PlanLockedMaterial', () => {
  it('shows every tab the lesson has, each named as locked', () => {
    render(
      <PlanLockedMaterial
        tabs={tabs}
        courseSlug="c"
        transcriptUsable={false}
      />,
    );
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(names).toContain('Quiz, locked');
    expect(names).toContain('Debrief, locked');
    expect(names.every((name) => name?.endsWith(', locked'))).toBe(true);
  });

  it('says why behind whichever tab is open', () => {
    render(
      <PlanLockedMaterial
        tabs={tabs}
        courseSlug="c"
        transcriptUsable={false}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Quiz/ }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain('Quiz locked');
    expect(panel.textContent).toContain('paid plan');
  });

  it('offers no Quiz tab on a lesson without one', () => {
    render(
      <PlanLockedMaterial
        tabs={{ ...tabs, hasQuiz: false }}
        courseSlug="c"
        transcriptUsable={false}
      />,
    );
    expect(screen.queryByRole('tab', { name: /Quiz/ })).toBeNull();
  });
});
