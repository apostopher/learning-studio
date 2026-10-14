// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LevelModeToggle } from '../level-mode-toggle';

describe('LevelModeToggle', () => {
  it('offers None first, then the three levels in order', () => {
    render(<LevelModeToggle value="basic" onValueChange={() => {}} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'None',
      'Basic',
      'Intermediate',
      'Advanced',
    ]);
  });

  it("hands 'none' to onValueChange when None is pressed", () => {
    const onValueChange = vi.fn();
    render(<LevelModeToggle value="basic" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onValueChange).toHaveBeenCalledWith('none');
  });
});
