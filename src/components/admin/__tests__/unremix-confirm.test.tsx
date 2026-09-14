// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnremixConfirm } from '../unremix-confirm';

describe('UnremixConfirm', () => {
  it('names how many modules leave, that nothing is deleted, and confirms on the button', () => {
    const onConfirm = vi.fn();
    render(
      <UnremixConfirm
        courseName="ITPS"
        sourceName="3D Airmanship"
        moduleCount={7}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/7 modules from 3D Airmanship will leave ITPS/),
    ).toBeTruthy();
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Un-remix 3D Airmanship' }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses the singular for one module', () => {
    render(
      <UnremixConfirm
        courseName="ITPS"
        sourceName="3D Airmanship"
        moduleCount={1}
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/1 module from 3D Airmanship will leave ITPS/),
    ).toBeTruthy();
  });
});
