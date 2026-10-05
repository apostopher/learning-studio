// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferingSegment } from '#/components/admin/schedule/offering-segment';

const handlers = () => ({
  onPointerEnter: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerLeave: vi.fn(),
  onFocus: vi.fn(),
  onBlur: vi.fn(),
  onClick: vi.fn(),
});

describe('OfferingSegment', () => {
  it('forwards hover, focus and click to its handlers with the segment as target', () => {
    const h = handlers();
    render(
      <OfferingSegment
        label="X"
        tone=""
        isStart
        isEnd={false}
        isContinuation={false}
        headcount={2}
        accessibleName="X, 2 people. Edit this offering."
        {...h}
      />,
    );
    const button = screen.getByRole('button', { name: /Edit this offering/ });
    fireEvent.pointerEnter(button, {
      pointerType: 'mouse',
      clientX: 5,
      clientY: 6,
    });
    fireEvent.pointerMove(button, { pointerType: 'mouse' });
    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    fireEvent.focus(button);
    fireEvent.blur(button);
    fireEvent.click(button);
    expect(h.onPointerEnter.mock.calls[0][0].target).toBe(button);
    expect(h.onPointerMove).toHaveBeenCalledTimes(1);
    expect(h.onPointerLeave).toHaveBeenCalledTimes(1);
    expect(h.onFocus).toHaveBeenCalledTimes(1);
    expect(h.onBlur).toHaveBeenCalledTimes(1);
    expect(h.onClick).toHaveBeenCalledTimes(1);
  });
});
