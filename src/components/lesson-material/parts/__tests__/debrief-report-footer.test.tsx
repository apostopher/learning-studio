// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEBRIEF_DECLINE_COPY,
  DEBRIEF_TWO_MISSED_COPY,
} from '#/lib/debrief-copy';
import { DebriefReportFooter } from '../debrief-report-footer';

// Base UI's Button calls hooks: one React, the CJS shim.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

function setup(props: Partial<Parameters<typeof DebriefReportFooter>[0]>) {
  const onRetakeNow = vi.fn();
  const onLater = vi.fn();
  render(
    <DebriefReportFooter
      passed={false}
      note={null}
      onRetakeNow={onRetakeNow}
      onLater={onLater}
      {...props}
    />,
  );
  return { onRetakeNow, onLater };
}

describe('DebriefReportFooter', () => {
  it('two misses: the prompt with Retake now and Later', () => {
    setup({ note: 'retake' });
    expect(screen.getByText(DEBRIEF_TWO_MISSED_COPY)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retake now' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Later' })).toBeDefined();
  });

  it('after Later, an unpassed report keeps Retake now, and it starts the retake', async () => {
    const { onRetakeNow } = setup({ passed: false, note: null });
    expect(screen.queryByText(DEBRIEF_TWO_MISSED_COPY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retake now' }));
    expect(onRetakeNow).toHaveBeenCalledOnce();
  });

  it('a passed report has no Retake now', () => {
    setup({ passed: true, note: null });
    expect(screen.queryByRole('button', { name: 'Retake now' })).toBeNull();
  });

  it('a declined offer says so, with no Retake now', () => {
    setup({ passed: true, note: 'declined' });
    expect(screen.getByText(DEBRIEF_DECLINE_COPY)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Retake now' })).toBeNull();
  });
});
