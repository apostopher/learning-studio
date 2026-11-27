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
  it('truncates a long name to one line, and gives its email to assistive tech', () => {
    const email = `${'very-long-address-'.repeat(6)}@example.com`;
    const name = 'Alexandria Montgomery-Featherstonehaugh the Third';
    render(
      <OfferingRosterTable
        users={[{ userId: 'u1', name, email, level: null, plan: 'paid' }]}
        onRemove={vi.fn()}
        onTogglePlan={vi.fn()}
      />,
    );
    const nameEl = screen.getByText(name);
    expect(nameEl.className).toContain('truncate');
    // No Email column (2026-11-28): the address is the name's tooltip, and
    // in the cell for a screen reader, which a hover tooltip never reaches.
    expect(nameEl.textContent).toBe(`${name}, ${email}`);
    expect(screen.queryByRole('columnheader', { name: 'Email' })).toBeNull();
  });
});

describe('OfferingRosterTable plan and remove', () => {
  const seat = (plan: 'paid' | 'free') => ({
    userId: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    level: null,
    plan,
  });

  it('heads the column Plan', () => {
    render(
      <OfferingRosterTable
        users={[seat('paid')]}
        onRemove={vi.fn()}
        onTogglePlan={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Plan' })).toBeTruthy();
  });

  it('shows a paid seat as PAID and flips it on a press', () => {
    const onTogglePlan = vi.fn();
    render(
      <OfferingRosterTable
        users={[seat('paid')]}
        onRemove={vi.fn()}
        onTogglePlan={onTogglePlan}
      />,
    );
    const chip = screen.getByRole('button', { name: /^Plan for Ada Lovelace/ });
    expect(chip.textContent).toBe('Paid');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onTogglePlan).toHaveBeenCalledWith('u1');
  });

  it('shows a free seat as FREE and says what it plays', () => {
    render(
      <OfferingRosterTable
        users={[seat('free')]}
        onRemove={vi.fn()}
        onTogglePlan={vi.fn()}
      />,
    );
    const chip = screen.getByRole('button', { name: /^Plan for Ada Lovelace/ });
    expect(chip.textContent).toBe('Free');
    expect(chip.getAttribute('aria-label')).toMatch(/first 15 seconds/);
  });

  it('locks the plan while the offering saves', () => {
    const onTogglePlan = vi.fn();
    render(
      <OfferingRosterTable
        users={[seat('paid')]}
        onRemove={vi.fn()}
        onTogglePlan={onTogglePlan}
        disabled
      />,
    );
    const chip = screen.getByRole('button', { name: /^Plan for Ada Lovelace/ });
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(chip);
    expect(onTogglePlan).not.toHaveBeenCalled();
  });

  it('removes with an icon button that names the person', () => {
    const onRemove = vi.fn();
    render(
      <OfferingRosterTable
        users={[seat('paid')]}
        onRemove={onRemove}
        onTogglePlan={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', {
      name: 'Remove Ada Lovelace from this offering',
    });
    expect(button.textContent).toBe('');
    fireEvent.click(button);
    expect(onRemove).toHaveBeenCalledWith('u1');
  });
});

describe('OfferingRosterTable level cell', () => {
  const ada = {
    userId: 'u1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    level: 'intermediate' as const,
    plan: 'paid' as const,
  };
  const bob = {
    userId: 'u2',
    name: 'Bob Hoover',
    email: 'bob@example.com',
    level: null,
    plan: 'paid' as const,
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
        onTogglePlan={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onCycleLevel={vi.fn()}
      />,
    );
    expect(adaChip().textContent).toBe('INTER');
    // The shared chip shape and the level's tone, not a bespoke colour.
    expect(adaChip().className).toContain('bg-apple-3');
    // No level: a muted "–" chip; its accessible name says "No level".
    const bobChip = screen.getByRole('button', {
      name: 'Level for Bob Hoover: No level. Press to change.',
    });
    expect(bobChip.textContent).toBe('–');
    expect(bobChip.className).toContain('bg-gray-4');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('hands the person to onCycleLevel on a press', () => {
    const onCycleLevel = vi.fn();
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        onTogglePlan={vi.fn()}
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
        onTogglePlan={vi.fn()}
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
        onTogglePlan={vi.fn()}
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
        onTogglePlan={vi.fn()}
        canEditLevels={false}
        levelLockReason={() => null}
        onCycleLevel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Level for/ })).toBeNull();
    expect(screen.getByText('INTER')).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
    expect(screen.getByText(/Levels are view only/)).toBeTruthy();
  });

  it('renders a read-only chip with its visible reason for a locked row', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        onTogglePlan={vi.fn()}
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
        onTogglePlan={vi.fn()}
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
        onTogglePlan={vi.fn()}
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

  it('heads the level column 3D', () => {
    render(
      <OfferingRosterTable
        users={[
          {
            userId: 'u1',
            name: 'Ada',
            email: 'a@x.com',
            level: null,
            plan: 'paid',
          },
        ]}
        onRemove={vi.fn()}
        onTogglePlan={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: '3D' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Level' })).toBeNull();
  });
});
