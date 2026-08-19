// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LevelPicker } from '../level-picker';

afterEach(() => {
  vi.clearAllMocks();
});

describe('LevelPicker', () => {
  it('exposes an accessible "Levels" name', () => {
    render(<LevelPicker value={[]} onValueChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Levels' })).toBeTruthy();
  });

  it('shows "All levels" as the placeholder when nothing is selected', () => {
    render(<LevelPicker value={[]} onValueChange={() => {}} />);
    expect(
      screen.getByRole('combobox', { name: 'Levels' }).getAttribute(
        'placeholder',
      ),
    ).toBe('All levels');
  });

  it('renders selected levels as chips with accessible remove labels', () => {
    render(<LevelPicker value={['basic']} onValueChange={() => {}} />);
    expect(screen.getByText('Basic')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remove Basic' }),
    ).toBeTruthy();
  });

  it('calls onValueChange with the level added when an option is picked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<LevelPicker value={['basic']} onValueChange={onValueChange} />);

    const input = screen.getByRole('combobox', { name: 'Levels' });
    await user.click(input);

    const option = await screen.findByRole('option', { name: 'Intermediate' });
    await user.click(option);

    expect(onValueChange).toHaveBeenCalledWith(['basic', 'intermediate']);
  });

  it('calls onValueChange with the level removed when a chip is removed', () => {
    const onValueChange = vi.fn();
    render(
      <LevelPicker
        value={['basic', 'intermediate']}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Basic' }));

    expect(onValueChange).toHaveBeenCalledWith(['intermediate']);
  });
});
