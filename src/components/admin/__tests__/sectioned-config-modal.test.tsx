// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactElement } from 'react';
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

/** A fresh jotai store per render: the open tab is remembered in an atom. */
function renderIsolated(ui: ReactElement) {
  return render(<Provider store={createStore()}>{ui}</Provider>);
}

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
    renderIsolated(
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
    renderIsolated(
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

  /**
   * Mutant this catches: rendering every section's footer at once, or none —
   * the footer is the ACTIVE section's primary action, pinned under the tab
   * list so it stays visible however far the panel scrolls.
   */
  it('pins only the active section’s sidebar footer under the tab list, and follows the tab', () => {
    renderIsolated(
      <SectionedConfigModal
        open
        onOpenChange={() => {}}
        title="Configure lesson"
        heading="Preflight"
        sections={[
          { value: 'video', title: 'Video', content: <p>video body</p> },
          {
            value: 'material',
            title: 'Content',
            content: <p>content body</p>,
            sidebarFooter: <button type="button">Save material</button>,
          },
          {
            value: 'config',
            title: 'Config',
            content: <p>config body</p>,
            sidebarFooter: <button type="button">Save config</button>,
          },
        ]}
        defaultSection="material"
      />,
    );
    const footer = screen.getByRole('button', { name: 'Save material' });
    expect(screen.queryByRole('button', { name: 'Save config' })).toBeNull();
    // It sits in the sidebar column, not inside the scrolling panel.
    expect(footer.closest('[data-sidebar]')).toBeTruthy();
    expect(footer.closest('[role="tabpanel"]')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Config' }));
    expect(screen.getByRole('button', { name: 'Save config' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save material' })).toBeNull();
  });

  it('falls back to the first section when the named one does not exist', () => {
    renderIsolated(
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
