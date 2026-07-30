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

  it('renders every control when `controls` is omitted', () => {
    // Existing call sites pass no `controls`, so the default must stay "all" —
    // otherwise adding the prop silently strips the prose editors' toolbars.
    render(<RichTextToolbar editor={makeEditor()} />);
    for (const name of [
      /bold/i,
      /italic/i,
      /heading 1/i,
      /heading 2/i,
      /heading 3/i,
      /bullet list/i,
      /ordered list/i,
      /blockquote/i,
      /inline code/i,
      /link/i,
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('renders only the requested controls', () => {
    render(
      <RichTextToolbar editor={makeEditor()} controls={['bold', 'italic']} />,
    );
    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy();
    for (const name of [
      /heading 1/i,
      /bullet list/i,
      /ordered list/i,
      /blockquote/i,
      /inline code/i,
      /link/i,
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('emits no separator when only one group is present', () => {
    // The separators used to be literal <span>s between JSX blocks, so a
    // bold+italic-only toolbar rendered a divider against nothing after it.
    const { container } = render(
      <RichTextToolbar editor={makeEditor()} controls={['bold', 'italic']} />,
    );
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(0);
  });

  it('separates groups but never leads or trails with one', () => {
    const { container } = render(
      <RichTextToolbar
        editor={makeEditor()}
        controls={['italic', 'bulletList', 'link']}
      />,
    );
    // Three groups represented -> exactly two dividers, both between buttons.
    const children = [...(container.firstElementChild?.children ?? [])];
    expect(
      children.filter((c) => c.getAttribute('aria-hidden') !== null),
    ).toHaveLength(2);
    expect(children.at(0)?.getAttribute('aria-hidden')).toBeNull();
    expect(children.at(-1)?.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps the link popover working when link is the only control', () => {
    // `link` is a LinkPopover, not a ToolbarButton, so it takes a separate
    // branch from the icon-button map and could be dropped by a filter that
    // only knows about buttons.
    render(<RichTextToolbar editor={makeEditor()} controls={['link']} />);
    expect(screen.getByRole('button', { name: /link/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /bold/i })).toBeNull();
  });
});
