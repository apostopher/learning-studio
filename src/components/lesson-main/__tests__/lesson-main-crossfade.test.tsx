// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonMain } from '../lesson-main';
import type { LessonMainState } from '../types';

const loading: LessonMainState = { kind: 'course-loading' };
const notFound: LessonMainState = {
  kind: 'not-found',
  lessonSlug: 'missing-lesson',
};

describe('LessonMain crossfade', () => {
  it('renders the skeleton while the course is loading', () => {
    const { container } = render(<LessonMain state={loading} />);
    expect(container.querySelector('.lesson-skeleton-player')).not.toBeNull();
  });

  it('replaces the skeleton with content once loaded', () => {
    const { container, rerender } = render(<LessonMain state={loading} />);
    rerender(<LessonMain state={notFound} />);
    expect(screen.getByText(/missing-lesson/)).toBeDefined();
  });

  it('keys the presence wrapper by state kind so the swap can animate', () => {
    const { container } = render(<LessonMain state={loading} />);
    expect(
      container.querySelector('[data-lesson-main-phase="course-loading"]'),
    ).not.toBeNull();
  });
});
