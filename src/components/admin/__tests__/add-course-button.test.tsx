// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AddCourseButton } from '../add-course-button';

it('is called New course', () => {
  const onClick = vi.fn();
  render(<AddCourseButton onClick={onClick} />);
  fireEvent.click(screen.getByRole('button', { name: 'New course' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});
