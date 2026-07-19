// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BinaryToggle } from '../binary-toggle';

const options = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const;

describe('BinaryToggle', () => {
  it('marks the active option pressed', () => {
    render(
      <BinaryToggle
        label="Debrief"
        value="on"
        onValueChange={() => {}}
        options={options}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'On' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Off' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('calls onValueChange with the newly selected value', () => {
    const onValueChange = vi.fn();
    render(
      <BinaryToggle
        label="Debrief"
        value="on"
        onValueChange={onValueChange}
        options={options}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onValueChange).toHaveBeenCalledWith('off');
  });

  it('does not fire when the active option is clicked (empty-selection guard)', () => {
    const onValueChange = vi.fn();
    render(
      <BinaryToggle
        label="Debrief"
        value="on"
        onValueChange={onValueChange}
        options={options}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'On' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('disables the option named by disabledValue', () => {
    render(
      <BinaryToggle
        label="Access"
        value="off"
        onValueChange={() => {}}
        options={options}
        disabledValue="on"
      />,
    );
    expect(screen.getByRole('button', { name: 'On' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
