// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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

describe('VersionChip', () => {
  it('on the version Disciplines is on: green, and says so', () => {
    render(
      <VersionChip version="1.0" disciplineVersion="1.0" editedIn="CPL" />,
    );
    expect(chip().textContent).toBe('v1.0');
    expect(chip().className).toContain('success');
    expect(chip().querySelector('svg')).toBeNull();
    expect(tooltip()).toBe('Up to date with Disciplines');
    expect(chip().getAttribute('aria-label')).toBe(
      'v1.0. Up to date with Disciplines',
    );
  });

  it.each([
    '1.1',
    '0.9',
  ])('with Disciplines on %s: gold, with an arrow, and says how to update', (disciplineVersion) => {
    render(
      <VersionChip
        version="1.0"
        disciplineVersion={disciplineVersion}
        editedIn="CPL"
      />,
    );
    expect(chip().textContent).toBe('v1.0');
    expect(chip().className).toContain('accent');
    expect(chip().querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    const says = `Disciplines has v${disciplineVersion}. To update, remove this lesson from the CPL column in the knowledge library and drag it in again`;
    expect(tooltip()).toBe(says);
    expect(chip().getAttribute('aria-label')).toBe(`v1.0. ${says}`);
  });

  it('is a flag: inert, but can be reached by keyboard', () => {
    render(
      <VersionChip version="1.0" disciplineVersion="1.1" editedIn="CPL" />,
    );
    expect(chip().getAttribute('aria-disabled')).toBe('true');
    expect((chip() as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the v lower case', () => {
    render(
      <VersionChip version="1.0" disciplineVersion="1.0" editedIn="CPL" />,
    );
    expect(chip().className).toContain('normal-case');
    expect(chip().className).not.toMatch(/(^|\s)uppercase/);
  });
});
