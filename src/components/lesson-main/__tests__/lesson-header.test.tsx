// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonHeader } from '../lesson-header';

describe('LessonHeader', () => {
  it('renders nothing when state.kind is idle', () => {
    const { container } = render(<LessonHeader state={{ kind: 'idle' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a busy skeleton when state.kind is loading', () => {
    render(<LessonHeader state={{ kind: 'loading' }} />);
    const region = screen.getByLabelText('Loading lesson');
    expect(region.getAttribute('aria-busy')).toBe('true');
  });

  it('renders an h1 with the name when state.kind is title', () => {
    render(<LessonHeader state={{ kind: 'title', name: 'My Lesson' }} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('My Lesson');
  });
});
