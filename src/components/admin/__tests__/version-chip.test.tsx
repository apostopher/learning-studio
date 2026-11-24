// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Drawn in place, so what the tooltip says can be read without hovering.
vi.mock('../../ui/tooltip-icon-button', () => ({
  IconButtonTooltip: ({ label }: { label: string }) => (
    <span data-testid="tooltip">{label}</span>
  ),
}));

import { VersionChip } from '../version-chip';

const chip = () => screen.getByRole('button');
const tooltip = () => screen.getByTestId('tooltip').textContent;
const press = async () => {
  const user = userEvent.setup();
  await user.click(chip());
  chip().focus();
  await user.keyboard('{Enter}');
  await user.keyboard(' ');
};

describe('VersionChip', () => {
  it('on the version Disciplines is on: green, inert, and says so', async () => {
    const onUpdate = vi.fn();
    render(
      <VersionChip version="1.0" disciplineVersion="1.0" onUpdate={onUpdate} />,
    );
    expect(chip().textContent).toBe('v1.0');
    expect(chip().className).toContain('success');
    expect(chip().querySelector('svg')).toBeNull();
    expect(tooltip()).toBe('Up to date with Disciplines');
    expect(chip().getAttribute('aria-label')).toBe(
      'v1.0. Up to date with Disciplines',
    );
    expect(chip().getAttribute('aria-disabled')).toBe('true');
    await press();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('on another version: gold, with an arrow, and offers the update', async () => {
    const onUpdate = vi.fn();
    render(
      <VersionChip version="1.0" disciplineVersion="1.1" onUpdate={onUpdate} />,
    );
    expect(chip().textContent).toBe('v1.0');
    expect(chip().className).toContain('accent');
    expect(chip().querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(tooltip()).toBe('Disciplines has v1.1. Update this lesson');
    expect(chip().getAttribute('aria-label')).toBe(
      'v1.0. Disciplines has v1.1. Update this lesson',
    );
    expect(chip().getAttribute('aria-disabled')).toBeNull();

    const user = userEvent.setup();
    await user.click(chip());
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('can be pressed from the keyboard', async () => {
    const onUpdate = vi.fn();
    render(
      <VersionChip version="1.0" disciplineVersion="1.1" onUpdate={onUpdate} />,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(chip());
    await user.keyboard('{Enter}');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('while updating: inert, and says to what', async () => {
    const onUpdate = vi.fn();
    render(
      <VersionChip
        version="1.0"
        disciplineVersion="1.1"
        onUpdate={onUpdate}
        isPending
      />,
    );
    expect(tooltip()).toBe('Updating to v1.1…');
    expect(chip().getAttribute('aria-disabled')).toBe('true');
    await press();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('with nothing to update through, does not offer it', () => {
    render(<VersionChip version="1.0" disciplineVersion="1.1" />);
    expect(tooltip()).toBe('Disciplines has v1.1');
    expect(chip().getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the v lower case', () => {
    render(<VersionChip version="1.0" disciplineVersion="1.0" />);
    expect(chip().className).toContain('normal-case');
    expect(chip().className).not.toMatch(/(^|\s)uppercase/);
  });
});
