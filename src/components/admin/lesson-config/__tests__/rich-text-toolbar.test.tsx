// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichTextToolbar } from '../rich-text-toolbar';

/** Minimal chainable mock of a TipTap editor for wiring assertions. */
function makeEditor(overrides: Record<string, unknown> = {}) {
  const run = vi.fn();
  const chain: Record<string, () => unknown> = {};
  const chainable = new Proxy(chain, {
    get(_t, prop) {
      if (prop === 'run') return run;
      return () => chainable;
    },
  });
  return {
    _run: run,
    chain: () => chainable,
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({})),
    ...overrides,
  } as never;
}

describe('RichTextToolbar', () => {
  it('renders the essential controls', () => {
    render(<RichTextToolbar editor={makeEditor()} />);
    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /heading 1/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /bullet list/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /link/i })).toBeTruthy();
  });

  it('runs the bold command on click', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    await userEvent.click(screen.getByRole('button', { name: /bold/i }));
    expect(
      (editor as { _run: ReturnType<typeof vi.fn> })._run,
    ).toHaveBeenCalled();
  });

  it('reflects active state via aria-pressed', () => {
    const editor = makeEditor({ isActive: vi.fn((n: string) => n === 'bold') });
    render(<RichTextToolbar editor={editor} />);
    expect(
      screen
        .getByRole('button', { name: /bold/i })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: /italic/i })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('compact mode omits headings', () => {
    render(<RichTextToolbar editor={makeEditor()} compact />);
    expect(screen.queryByRole('button', { name: /heading 1/i })).toBeNull();
    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
  });
});
