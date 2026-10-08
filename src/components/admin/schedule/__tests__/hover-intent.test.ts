import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHoverIntent,
  HOVER_CLOSE_GRACE_MS,
  HOVER_OPEN_DELAY_MS,
} from '../hover-intent';

describe('createHoverIntent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    return { onOpen, onClose, intent: createHoverIntent({ onOpen, onClose }) };
  };

  it('opens after the delay, not before', () => {
    const { onOpen, intent } = setup();
    intent.enter(7, 'mouse', false);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 1);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it('sweeping across without stopping opens nothing', () => {
    const { onOpen, intent } = setup();
    intent.enter(7, 'mouse', false);
    vi.advanceTimersByTime(100);
    intent.leave(7, 'mouse');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('switches immediately when a preview is already showing', () => {
    const { onOpen, intent } = setup();
    intent.enter(9, 'mouse', true);
    expect(onOpen).toHaveBeenCalledWith(9);
  });

  it('re-entering the same offering within the grace keeps it open', () => {
    const { onClose, intent } = setup();
    intent.leave(7, 'mouse'); // left day 3 of the bar…
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE_MS - 10);
    intent.enter(7, 'mouse', true); // …onto day 4
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes after the grace when the pointer really left', () => {
    const { onClose, intent } = setup();
    intent.leave(7, 'mouse');
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE_MS);
    expect(onClose).toHaveBeenCalledWith(7);
  });

  it('ignores non-mouse pointers', () => {
    const { onOpen, onClose, intent } = setup();
    intent.enter(7, 'touch', false);
    intent.enter(7, 'pen', false);
    intent.leave(7, 'touch');
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel drops pending timers', () => {
    const { onOpen, intent } = setup();
    intent.enter(7, 'mouse', false);
    intent.cancel();
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
