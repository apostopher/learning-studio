// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoursePassMark } from '#/components/admin/schedule/course-pass-mark';
import { ScheduleCourseCard } from '#/components/admin/schedule/schedule-course-card';

const baseProps = {
  courseId: 7,
  courseName: 'ITPS UAS',
  passMark: 85,
  open: false,
  onOpenChange: vi.fn(),
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  inputProps: {},
  isPending: false,
};

describe('CoursePassMark', () => {
  it('shows the current pass mark with an accessible name that names the course', () => {
    render(<CoursePassMark {...baseProps} />);
    const button = screen.getByRole('button', {
      name: 'Pass mark for ITPS UAS, currently 85',
    });
    expect(button.textContent).toBe('Pass mark 85');
  });
});

describe('CoursePassMark open', () => {
  it('points aria-describedby at the hint element id', () => {
    render(<CoursePassMark {...baseProps} open />);
    const input = screen.getByLabelText('Pass mark');
    const hintId = input.getAttribute('aria-describedby') ?? '';
    expect(hintId).toBe('pass-mark-hint-7');
    expect(document.getElementById(hintId)?.textContent).toContain('0–100');
  });
});

describe('ScheduleCourseCard passMarkSlot', () => {
  it('renders the slot outside the drag handle and keeps pointer/key events off it', () => {
    const onPointerDown = vi.fn();
    const onKeyDown = vi.fn();
    render(
      <ScheduleCourseCard
        name="ITPS UAS"
        moduleCount={2}
        lessonCount={5}
        dragHandleProps={
          { onPointerDown, onKeyDown, 'data-drag': 'yes' } as never
        }
        passMarkSlot={<button type="button">slot</button>}
      />,
    );
    const slot = screen.getByRole('button', { name: 'slot' });
    expect(slot.closest('[data-drag="yes"]')).toBeNull();
    fireEvent.pointerDown(slot);
    fireEvent.keyDown(slot, { key: ' ' });
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
