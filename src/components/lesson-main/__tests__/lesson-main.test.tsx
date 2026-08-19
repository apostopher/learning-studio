// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/components/lesson-material', () => ({
  LessonMaterialWrapper: ({
    lessonSlug,
    courseSlug,
  }: {
    lessonSlug: string;
    courseSlug: string;
  }) => (
    <div data-testid="lesson-material">
      {lessonSlug}:{courseSlug}
    </div>
  ),
}));

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

  it('renders no-video status with the lesson name (title now lives in header)', () => {
    render(
      <LessonMain
        state={{
          kind: 'no-video',
          lessonName: 'Lesson Two',
          lessonSlug: 'l-1',
          courseSlug: 'c-1',
          hasDebrief: false,
          videoExpected: false,
        }}
      />,
    );
    // h1 is rendered by LessonHeader in the AppShell header, not here.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Lesson Two');
  });

  it('renders the lock reason and no player when state.kind is locked', () => {
    render(
      <LessonMain
        state={{
          kind: 'locked',
          lessonName: 'Lesson Three',
          courseSlug: 'course-one',
          lock: {
            locked: true,
            reason: 'lesson',
            blockedBy: {
              lessonSlug: 'a',
              moduleSlug: 'm-1',
              lessonName: 'Lesson One',
            },
          },
        }}
      />,
    );
    // The player and material slots must never mount for a locked lesson —
    // a prerequisite gate locks the whole page, not just the material panel.
    expect(screen.queryByRole('region', { name: 'Video player' })).toBeNull();
    expect(screen.queryByTestId('lesson-material')).toBeNull();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Lesson Three');
    expect(status.textContent).toContain('Lesson One');
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/course/course-one/modules/m-1/lessons/a',
    );
  });

  it('renders the player when state.kind is ready with fetching video', () => {
    // ready+fetching uses the pure VideoPlayer (no container), so we don't
    // hit the project's vitest hook-resolution issue with VideoPlayerContainer.
    render(
      <LessonMain
        state={{
          kind: 'ready',
          lessonName: 'Lesson One',
          lessonSlug: 'lesson-one',
          courseSlug: 'course-one',
          hasDebrief: false,
          videoState: { status: 'fetching' },
        }}
      />,
    );
    // h1 is in the header now, not the article body.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('region', { name: 'Video player' })).toBeTruthy();
    // The material slot must receive courseSlug so a locked panel can link
    // to the blocking lesson — not just lessonSlug.
    expect(screen.getByTestId('lesson-material').textContent).toBe(
      'lesson-one:course-one',
    );
  });

  it('renders the read-only banner and the player for a read-only lesson with video', () => {
    render(
      <LessonMain
        state={{
          kind: 'read-only',
          lessonName: 'Lesson One',
          lessonSlug: 'lesson-one',
          courseSlug: 'course-one',
          hasDebrief: false,
          videoExpected: true,
          videoState: { status: 'fetching' },
        }}
      />,
    );
    // Two role="status" elements exist while the video is still loading (the
    // read-only banner and the player's own loading indicator) — find ours by
    // its text rather than by role alone.
    const banner = screen.getByText(/earlier level/);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('nothing you do is recorded');
    expect(screen.getByRole('region', { name: 'Video player' })).toBeTruthy();
    expect(screen.getByTestId('lesson-material').textContent).toBe(
      'lesson-one:course-one',
    );
  });

  it('renders the no-video card instead of the player for a read-only lesson with no video', () => {
    render(
      <LessonMain
        state={{
          kind: 'read-only',
          lessonName: 'Lesson One',
          lessonSlug: 'lesson-one',
          courseSlug: 'course-one',
          hasDebrief: false,
          videoExpected: false,
          videoState: null,
        }}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Video player' })).toBeNull();
    expect(screen.getByTestId('lesson-material').textContent).toBe(
      'lesson-one:course-one',
    );
  });
});
