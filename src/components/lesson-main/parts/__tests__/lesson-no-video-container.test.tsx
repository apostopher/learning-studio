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
  lessonSlug: 'radio-calls',
  hasDebrief: true,
  videoExpected: false,
};

describe('LessonNoVideoContainer', () => {
  it('offers the debrief shortcut on a normal video-less lesson', () => {
    render(<LessonNoVideoContainer {...props} readOnly={false} />);
    expect(screen.getByRole('button', { name: /Debrief/ })).toBeDefined();
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
