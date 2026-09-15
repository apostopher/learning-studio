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

  /**
   * A dialog with ONE section has nothing to tab between: no sidebar, no
   * footer — the section's primary action lives in the header instead
   * (`headerActions`, beside Close), and `headingSlot` replaces the plain
   * text heading with something the caller owns (an editable name).
   * Mutant: a one-item tab list drawn anyway, or the header slot dropped.
   */
  it('with a single section draws no sidebar, and puts header actions beside Close', () => {
    renderIsolated(
      <SectionedConfigModal
        open
        onOpenChange={() => {}}
        title="Edit lesson"
        heading="Preflight"
        sections={[
          {
            value: 'material',
            title: 'Content',
            content: <p>content body</p>,
            sidebarFooter: <button type="button">Save (footer)</button>,
          },
        ]}
        headerActions={<button type="button">Save material</button>}
        headingSlot={<h2>Preflight (editable)</h2>}
      />,
    );
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save (footer)' })).toBeNull();
    expect(screen.getByText('content body')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Preflight (editable)' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Preflight' })).toBeNull();
    const save = screen.getByRole('button', { name: 'Save material' });
    const close = screen.getByRole('button', { name: /close/i });
    // Same header row, save before close.
    expect(save.parentElement).toBe(close.parentElement);
    expect(
      save.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
