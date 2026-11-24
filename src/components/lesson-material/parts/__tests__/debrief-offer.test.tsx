// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEBRIEF_PASS_OFFER_COPY, passOfferCopy } from '#/lib/debrief-copy';
import { setScore } from '#/lib/lesson-score';
import { DebriefOffer } from '../debrief-offer';

// Base UI's Button calls hooks: one React, the CJS shim as in
// debrief-feedback.test.tsx.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

function setup(props: Partial<Parameters<typeof DebriefOffer>[0]> = {}) {
  const onYes = vi.fn();
  const onNo = vi.fn();
  render(
    <DebriefOffer
      copy={DEBRIEF_PASS_OFFER_COPY}
      score={setScore({ quiz: { correct: 5, total: 5 } }, 85, 62.5)}
      quizTaken={true}
      pending={null}
      error=""
      onYes={onYes}
      onNo={onNo}
      headingLevel={2}
      idBase=":o:"
      {...props}
    />,
  );
  return { onYes, onNo };
}

describe('DebriefOffer', () => {
  it('shows the set 1 total, then the offer word for word', () => {
    setup({ copy: passOfferCopy(2) });
    const region = screen.getByRole('region', { name: 'Set 1 passed' });
    expect(region.textContent).toContain(
      'Quiz 25 + Debrief 62.5 = 87.5 · pass mark 85',
    );
    expect(screen.getByText(passOfferCopy(2))).toBeDefined();
  });

  it('Yes and No are buttons that hand the choice to the container', async () => {
    const { onYes, onNo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onYes).toHaveBeenCalledOnce();
    expect(onNo).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onNo).toHaveBeenCalledOnce();
  });

  it('while a choice is sending, neither can be pressed again', async () => {
    const { onYes, onNo } = setup({ pending: 'yes' });
    await userEvent.click(screen.getByRole('button', { name: /Yes/ }));
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onYes).not.toHaveBeenCalled();
    expect(onNo).not.toHaveBeenCalled();
  });

  it('a failed choice is announced, and the buttons stay to try again', async () => {
    const { onNo } = setup({ error: "Your choice didn't send." });
    expect(screen.getByRole('alert').textContent).toBe(
      "Your choice didn't send.",
    );
    await userEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onNo).toHaveBeenCalledOnce();
  });

  it('hands its heading to the ref it is given, focusable, so the offer is read first', () => {
    let heading: HTMLHeadingElement | null = null;
    setup({
      headingRef: (el) => {
        heading = el;
      },
    });
    expect((heading as unknown as HTMLElement).tabIndex).toBe(-1);
    expect((heading as unknown as HTMLElement).tagName).toBe('H2');
  });
});
