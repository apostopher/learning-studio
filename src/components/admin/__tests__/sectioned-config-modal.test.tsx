// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ScrollArea carries hooks; react-compiler nulls the dispatcher for this
// repo's components under vitest, so it is stubbed to a plain div — the same
// pattern the other admin component tests use for hook-bearing children.
vi.mock('#/components/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { SectionedConfigModal } from '../sectioned-config-modal';

const sections = [
  { value: 'video', title: 'Video', content: <p>video body</p> },
  { value: 'material', title: 'Content', content: <p>content body</p> },
  { value: 'config', title: 'Config', content: <p>config body</p> },
];

function selectedTab(): string | undefined {
  return screen
    .getAllByRole('tab')
    .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent;
}

describe('SectionedConfigModal default section', () => {
  it('opens on the first section when none is named', () => {
    render(
      <SectionedConfigModal
        open
        onOpenChange={() => {}}
        title="Configure lesson"
        heading="Preflight"
        sections={sections}
      />,
    );
    expect(selectedTab()).toBe('Video');
    expect(screen.getByText('video body')).toBeTruthy();
  });

  /**
   * Mutant this catches: `defaultSection` accepted but ignored (the shell
   * keeps `sections[0]`), which compiles and passes the test above.
   */
  it('opens on the named section, leaving the tab order alone', () => {
    render(
      <SectionedConfigModal
        open
        onOpenChange={() => {}}
        title="Configure lesson"
        heading="Preflight"
        sections={sections}
        defaultSection="material"
      />,
    );
    expect(selectedTab()).toBe('Content');
    expect(screen.getByText('content body')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Video',
      'Content',
      'Config',
    ]);
  });

  it('falls back to the first section when the named one does not exist', () => {
    render(
      <SectionedConfigModal
        open
        onOpenChange={() => {}}
        title="Configure lesson"
        heading="Preflight"
        sections={sections}
        defaultSection="missing"
      />,
    );
    expect(selectedTab()).toBe('Video');
  });
});
