// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseRail } from '../course-rail';
import { DisciplineColumn } from '../discipline-column';
import { LessonLibrary } from '../lesson-library';

// The knowledge library editor is wide and dense; its scrollers carry the
// larger scrollbar so they are easy to see and grab.
const large = (container: HTMLElement) =>
  container.querySelectorAll('.scroll-area-root--large').length;

describe('knowledge library scrollers use the larger scrollbar', () => {
  it('discipline column', () => {
    const { container } = render(
      <DisciplineColumn name="UAS" lessonCount={1}>
        <span>x</span>
      </DisciplineColumn>,
    );
    expect(large(container)).toBe(1);
  });

  it('lesson library rail', () => {
    const { container } = render(
      <LessonLibrary>
        <span>x</span>
      </LessonLibrary>,
    );
    expect(large(container)).toBeGreaterThanOrEqual(1);
  });

  it('course rail', () => {
    const { container } = render(
      <CourseRail>
        <span>x</span>
      </CourseRail>,
    );
    expect(large(container)).toBeGreaterThanOrEqual(1);
  });
});
