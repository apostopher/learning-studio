// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorPaneSplitter } from '../editor-pane-splitter';

describe('EditorPaneSplitter', () => {
  it('exposes the separator ARIA contract and is reachable by keyboard', () => {
    // Mutant: `tabIndex={0}` is dropped from the element. This assertion
    // fails against that mutant because a plain `<div>` with no tabindex is
    // never in the tab order, so `document.activeElement` never becomes the
    // handle after `.focus()`.
    render(<EditorPaneSplitter onPointerDown={vi.fn()} ariaValueNow={50} />);
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuenow')).toBe('50');

    handle.focus();
    expect(document.activeElement).toBe(handle);
  });

  it('announces the range the container will actually let it reach', () => {
    // Mutant: `aria-valuemin={0}` / `aria-valuemax={100}` hardcoded back onto
    // the element. This fails against that mutant because the editor clamps
    // the split to 20–80, and a screen reader told the range runs to 0 hears
    // the handle stop responding with no explanation.
    render(
      <EditorPaneSplitter
        onPointerDown={vi.fn()}
        ariaValueNow={40}
        ariaValueMin={20}
        ariaValueMax={80}
      />,
    );
    const handle = screen.getByRole('separator');
    expect(handle.getAttribute('aria-valuemin')).toBe('20');
    expect(handle.getAttribute('aria-valuemax')).toBe('80');
  });

  it('relays onPointerDown to the caller', () => {
    // Mutant: the `onPointerDown` prop is accepted but never wired onto the
    // element. This assertion fails against that mutant because the spy
    // would never be called by firing a pointerdown on the handle.
    const onPointerDown = vi.fn();
    render(
      <EditorPaneSplitter onPointerDown={onPointerDown} ariaValueNow={50} />,
    );
    const handle = screen.getByRole('separator');
    handle.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
