// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StringListField } from '../string-list-field';

describe('StringListField', () => {
  it('renders one input per value with the item label', () => {
    render(
      <StringListField
        label="Key points"
        itemNoun="key point"
        value={['Alpha', 'Bravo']}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Alpha')).toBeTruthy();
    expect(screen.getByDisplayValue('Bravo')).toBeTruthy();
  });

  it('appends an empty item when Add is clicked', async () => {
    const onChange = vi.fn();
    render(
      <StringListField
        label="Links"
        itemNoun="link"
        value={['one']}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /add link/i }));
    expect(onChange).toHaveBeenCalledWith(['one', '']);
  });

  it('removes the item at the clicked index', async () => {
    const onChange = vi.fn();
    render(
      <StringListField
        label="Links"
        itemNoun="link"
        value={['one', 'two']}
        onChange={onChange}
      />,
    );
    const removes = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(removes[0]);
    expect(onChange).toHaveBeenCalledWith(['two']);
  });
});
