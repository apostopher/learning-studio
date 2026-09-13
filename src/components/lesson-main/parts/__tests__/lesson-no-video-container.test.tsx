// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ useLessonMaterial: vi.fn() }));
vi.mock('#/hooks/data/use-lesson-material', () => ({
  useLessonMaterial: h.useLessonMaterial,
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
  it('offers the debrief shortcut on a normal video-less lesson', () => {
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(screen.getByRole('button', { name: /Debrief/ })).toBeDefined();
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

  /**
   * The shortcut only switches tabs — it does not start anything. On a
   * read-only lesson the Debrief tab's Start is disabled, so offering the
   * shortcut hands the pilot a button whose entire effect is to deposit them
   * on a dead end.
   */
  it('offers no debrief shortcut on a read-only lesson', () => {
    render(<LessonNoVideoContainer {...props} readOnly />);
    expect(screen.queryByRole('button', { name: /Debrief/ })).toBeNull();
  });
});
