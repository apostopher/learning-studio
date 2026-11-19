// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEBRIEF_TWO_MISSED_COPY } from '#/lib/debrief-copy';
import { DebriefRetakePrompt } from '../debrief-retake-prompt';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

describe('DebriefRetakePrompt', () => {
  it('says what to do, word for word, then Retake now or Later', async () => {
    const onRetakeNow = vi.fn();
    const onLater = vi.fn();
    render(<DebriefRetakePrompt onRetakeNow={onRetakeNow} onLater={onLater} />);
    expect(screen.getByText(DEBRIEF_TWO_MISSED_COPY)).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Retake now' }));
    expect(onRetakeNow).toHaveBeenCalledOnce();
    expect(onLater).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onLater).toHaveBeenCalledOnce();
  });
});
