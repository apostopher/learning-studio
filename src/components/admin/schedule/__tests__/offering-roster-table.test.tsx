// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferingRosterTable } from '../offering-roster-table';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

describe('OfferingRosterTable row height', () => {
  it('truncates long name and email to one line, keeping the full value in title', () => {
    const email = `${'very-long-address-'.repeat(6)}@example.com`;
    const name = 'Alexandria Montgomery-Featherstonehaugh the Third';
    render(
      <OfferingRosterTable
        users={[{ userId: 'u1', name, email, level: null }]}
        onRemove={vi.fn()}
      />,
    );
    const emailEl = screen.getByText(email);
    expect(emailEl.getAttribute('title')).toBe(email);
    expect(emailEl.className).toContain('truncate');
    const nameEl = screen.getByText(name);
    expect(nameEl.getAttribute('title')).toBe(name);
    expect(nameEl.className).toContain('truncate');
  });
});

describe('OfferingRosterTable level cell', () => {
  const ada = {
    userId: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    level: 'intermediate' as const,
  };
  const bob = {
    userId: 'u2',
    name: 'Bob Hoover',
    email: 'bob@example.com',
    level: null,
  };
  const adaChip = () =>
    screen.getByRole('button', {
      name: 'Level for Ada Lovelace: Intermediate. Press to change.',
    });

  it('is a chip button named for the person and their level when editable', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onCycleLevel={vi.fn()}
      />,
    );
    expect(adaChip().textContent).toBe('INTER');
    // The shared chip shape and the level's tone, not a bespoke colour.
    expect(adaChip().className).toContain('bg-apple-3');
    // No level yet: a muted chip that says so, not a blank or "NONE".
    const bobChip = screen.getByRole('button', {
      name: 'Level for Bob Hoover: No level. Press to change.',
    });
    expect(bobChip.textContent).toBe('No level');
    expect(bobChip.className).toContain('bg-gray-4');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('hands the person to onCycleLevel on a press', () => {
    const onCycleLevel = vi.fn();
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onCycleLevel={onCycleLevel}
      />,
    );
    fireEvent.click(adaChip());
    expect(onCycleLevel).toHaveBeenCalledWith('u1');
  });

  it('shows the level displayLevel gives, over the row’s saved one', () => {
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onCycleLevel={vi.fn()}
        displayLevel={() => 'advanced'}
      />,
    );
    const chip = screen.getByRole('button', {
      name: 'Level for Ada Lovelace: Advanced. Press to change.',
    });
    expect(chip.textContent).toBe('EXPERT');
    expect(chip.className).toContain('bg-success-3');
  });

  it('shows a spinner by a saving row and keeps its chip pressable', () => {
    const onCycleLevel = vi.fn();
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onCycleLevel={onCycleLevel}
        savingUserIds={['u1']}
      />,
    );
    expect(adaChip().getAttribute('aria-busy')).toBe('true');
    expect(
      adaChip().closest('td')?.querySelector('.animate-spin'),
    ).not.toBeNull();
    fireEvent.click(adaChip());
    expect(onCycleLevel).toHaveBeenCalledWith('u1');
    const bobChip = screen.getByRole('button', {
      name: /Level for Bob Hoover/,
    });
    expect(bobChip.getAttribute('aria-busy')).toBeNull();
    expect(bobChip.closest('td')?.querySelector('.animate-spin')).toBeNull();
  });

  it('renders read-only chips (not buttons) and says why without level:update', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels={false}
        levelLockReason={() => null}
        onCycleLevel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Level for/ })).toBeNull();
    expect(screen.getByText('INTER')).toBeTruthy();
    expect(screen.getByText('No level')).toBeTruthy();
    expect(screen.getByText(/Levels are view only/)).toBeTruthy();
  });

  it('renders a read-only chip with its visible reason for a locked row', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={(userId) =>
          userId === 'u1'
            ? { short: 'Not in directory', full: 'Not in the user directory' }
            : null
        }
        onCycleLevel={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Level for Ada Lovelace/ }),
    ).toBeNull();
    expect(screen.getByText('INTER').tagName).toBe('SPAN');
    // Visible, and complete for assistive tech.
    expect(screen.getByText('Not in directory')).toBeTruthy();
    expect(screen.getByText('Not in the user directory')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Level for Bob Hoover/ }),
    ).toBeTruthy();
  });

  it('states the view-only reason in the reviewed words', () => {
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels={false}
        onCycleLevel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Levels are view only here. Changing them needs an admin with the Levels “update” permission.',
      ),
    ).toBeTruthy();
  });

  it('a chip locked while the offering saves ignores presses and keeps AA text', () => {
    const onCycleLevel = vi.fn();
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onCycleLevel={onCycleLevel}
        disabled
      />,
    );
    // A locked state says why, in its name (and its tooltip).
    const locked = screen.getByRole('button', {
      name: 'Level for Ada Lovelace: Intermediate. Locked while the offering saves.',
    });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(locked);
    expect(onCycleLevel).not.toHaveBeenCalled();
    expect(locked.className).not.toMatch(/opacity/);
  });
});
