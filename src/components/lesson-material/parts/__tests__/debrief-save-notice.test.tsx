// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DebriefSaveNotice } from '../debrief-save-notice';

describe('DebriefSaveNotice', () => {
  it('failed: says the attempt was not recorded, and offers to save it again', async () => {
    const onRetry = vi.fn();
    render(<DebriefSaveNotice state="failed" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain(
      'Your answers weren’t saved, so this attempt doesn’t count yet.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Try saving again' }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('saving: says so, with no action to press', () => {
    render(<DebriefSaveNotice state="saving" onRetry={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      'Saving your answers…',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
