// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonMain } from '../lesson-main';

describe('LessonMain', () => {
  it('renders the skeleton when state.kind is course-loading', () => {
    render(<LessonMain state={{ kind: 'course-loading' }} />);
    expect(
      screen.getByRole('article', { busy: true, name: 'Loading lesson' }),
    ).toBeTruthy();
  });

  it('renders an alert with retry when state.kind is course-error', async () => {
    const onRetry = vi.fn();
    render(
      <LessonMain
        state={{
          kind: 'course-error',
          message: 'boom',
          onRetry,
        }}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry loading the course' }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders not-found status with the slug', () => {
    render(
      <LessonMain
        state={{ kind: 'not-found', lessonSlug: 'missing-lesson' }}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('missing-lesson');
  });

  it('renders no-video status with the lesson name and title', () => {
    render(
      <LessonMain state={{ kind: 'no-video', lessonName: 'Lesson Two' }} />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Lesson Two',
    );
    expect(screen.getByRole('status').textContent).toContain('Lesson Two');
  });

  it('renders the title when state.kind is ready with fetching video', () => {
    // ready+fetching uses the pure VideoPlayer (no container), so we don't
    // hit the project's vitest hook-resolution issue with VideoPlayerContainer.
    render(
      <LessonMain
        state={{
          kind: 'ready',
          lessonName: 'Lesson One',
          videoId: 'v1',
          videoState: { status: 'fetching' },
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Lesson One',
    );
    // The pure VideoPlayer renders the spinner via role=status
    expect(screen.getByRole('region', { name: 'Video player' })).toBeTruthy();
  });
});
