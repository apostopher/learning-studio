// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonMain } from '../../components/lesson-main';

// The route renders <LessonMainWrapper /> which depends on the jotai store
// and TanStack Query. Smoke-testing the route file itself would require a
// full router + query-client harness. Instead, we test the pure component
// with a known state — the wrapper is exercised through Storybook + dev mode.
describe('lesson route content', () => {
  it('renders course-loading skeleton without throwing', () => {
    const { container } = render(
      <LessonMain state={{ kind: 'course-loading' }} />,
    );
    expect(container.querySelector('.lesson-main')).toBeTruthy();
  });
});
