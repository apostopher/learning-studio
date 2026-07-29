// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreRing } from '../score-ring';

// The progress circle is the second <circle> — the first is the static
// track. Its stroke attribute is what the browser actually paints, which is
// what matters: a solid step (-9 / -solid) is a fill color tuned for large
// areas and can fail WCAG 1.4.11's 3:1 non-text minimum for hues like
// warning's yellow-orange, while -text is measured and guaranteed to clear
// it (it already clears the stricter 4.5:1 text minimum).
function progressStroke(container: HTMLElement): string | null {
  const circles = container.querySelectorAll('circle');
  return circles[1]?.getAttribute('stroke') ?? null;
}

describe('ScoreRing', () => {
  it('strokes a passing score with the AA-safe -text token, not -solid', () => {
    const { container } = render(<ScoreRing score={90} />);
    expect(progressStroke(container)).toBe('var(--color-success-text)');
  });

  it('strokes a middling score with the AA-safe -text token, not -solid', () => {
    const { container } = render(<ScoreRing score={60} />);
    expect(progressStroke(container)).toBe('var(--color-warning-text)');
  });

  it('strokes a failing score with the AA-safe -text token, not -solid', () => {
    const { container } = render(<ScoreRing score={20} />);
    expect(progressStroke(container)).toBe('var(--color-error-text)');
  });
});
