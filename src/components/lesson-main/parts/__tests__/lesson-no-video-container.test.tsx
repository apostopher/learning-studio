// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  useLessonMaterial: vi.fn(),
  usePrepareDebriefOnVisit: vi.fn(),
}));
vi.mock('#/hooks/data/use-lesson-material', () => ({
  useLessonMaterial: h.useLessonMaterial,
}));
vi.mock('#/data-hooks/use-prepare-debrief', () => ({
  usePrepareDebriefOnVisit: h.usePrepareDebriefOnVisit,
}));

import { LessonNoVideoContainer } from '../lesson-no-video-container';

beforeEach(() => {
  vi.clearAllMocks();
  h.useLessonMaterial.mockReturnValue({
    data: { locked: false, material: { text: '<p>Body</p>' } },
  });
});

const props = {
  lessonName: 'Radio Calls',
  courseSlug: 'ppl',
  lessonSlug: 'radio-calls',
  hasDebrief: true,
  videoExpected: false,
};

describe('LessonNoVideoContainer', () => {
  /**
   * The card's Debrief button only switched to the Debrief tab — the same
   * shortcut the post-video button was. The debrief now opens 24h after the
   * lesson is done, so the shortcut would land on a schedule, not a debrief;
   * the tab itself says when it opens.
   */
  it('offers no debrief button, even on a normal video-less debrief lesson', () => {
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the debrief in the heading when the lesson has a Debrief tab', () => {
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(
      screen.getByRole('heading', {
        name: 'Radio Calls is reading and debrief',
      }),
    ).toBeDefined();
  });

  it('reads the material for the course the lesson is being viewed in', () => {
    // The material query is per course (Task 6a): the hook must receive both
    // slugs, or the container reads (and caches) another course's answer.
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(h.useLessonMaterial).toHaveBeenCalledWith({
      courseSlug: 'ppl',
      lessonSlug: 'radio-calls',
    });
  });

  it('does not promise a debrief on a read-only lesson, which has no Debrief tab', () => {
    render(<LessonNoVideoContainer {...props} readOnly />);
    expect(
      screen.getByRole('heading', { name: 'Radio Calls is reading' }),
    ).toBeDefined();
  });

  /**
   * This card renders only for lessons with no video, which never mount the
   * player's prepare-on-play — so this is where their first-visit prepare
   * lives (spec: "For lessons with no video, generation runs on first
   * visit"). Lessons with a video never reach this container.
   */
  it('asks to prepare the debrief for this lesson and course on first visit', () => {
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(h.usePrepareDebriefOnVisit).toHaveBeenCalledWith({
      courseSlug: 'ppl',
      lessonSlug: 'radio-calls',
      hasDebrief: true,
      canDebrief: true,
      readOnly: false,
    });
  });

  it('passes the facts that hold the prepare off on a read-only lesson', () => {
    render(<LessonNoVideoContainer {...props} readOnly />);
    expect(h.usePrepareDebriefOnVisit).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true }),
    );
  });

  it('cannot prepare before the material says there is something to generate from', () => {
    h.useLessonMaterial.mockReturnValue({ data: undefined });
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(h.usePrepareDebriefOnVisit).toHaveBeenCalledWith(
      expect.objectContaining({ canDebrief: false }),
    );
  });
});
