// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LinkPopover } from '../link-popover';

/**
 * Chainable mock of a TipTap editor. `setLink`/`unsetLink` are the terminal
 * calls we assert on; every other chain method (`focus`, `extendMarkRange`,
 * `run`) returns the same proxy so `.chain().focus().extendMarkRange('link').setLink(...).run()`
 * resolves without error.
 */
function makeEditor(overrides: Record<string, unknown> = {}) {
  const setLink = vi.fn();
  const unsetLink = vi.fn();
  const chain: Record<string, unknown> = { setLink, unsetLink };
  const chainable = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'setLink' || prop === 'unsetLink') {
        return (...args: unknown[]) => {
          (target[prop as string] as ReturnType<typeof vi.fn>)(...args);
          return chainable;
        };
      }
      return () => chainable;
    },
  });
  return {
    _setLink: setLink,
    _unsetLink: unsetLink,
    chain: () => chainable,
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({ href: 'https://existing.com' })),
    ...overrides,
  } as never;
}

describe('LinkPopover', () => {
  it('prefills the input with the current link href on open', async () => {
    const editor = makeEditor();
    render(<LinkPopover editor={editor} />);
    await userEvent.click(screen.getByRole('button', { name: /link/i }));
    const input = (await screen.findByLabelText(
      'Link URL',
    )) as HTMLInputElement;
    expect(input.value).toBe('https://existing.com');
  });

  it('normalizes a scheme-less URL before applying it', async () => {
    const editor = makeEditor();
    render(<LinkPopover editor={editor} />);
    await userEvent.click(screen.getByRole('button', { name: /link/i }));
    const input = (await screen.findByLabelText(
      'Link URL',
    )) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, 'example.com');
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(
      (editor as { _setLink: ReturnType<typeof vi.fn> })._setLink,
    ).toHaveBeenCalledWith({ href: 'https://example.com' });
  });

  it('unsets the link when Remove is clicked', async () => {
    const editor = makeEditor();
    render(<LinkPopover editor={editor} />);
    await userEvent.click(screen.getByRole('button', { name: /link/i }));
    await screen.findByLabelText('Link URL');
    await userEvent.click(screen.getByRole('button', { name: /remove link/i }));
    expect(
      (editor as { _unsetLink: ReturnType<typeof vi.fn> })._unsetLink,
    ).toHaveBeenCalled();
  });
});
