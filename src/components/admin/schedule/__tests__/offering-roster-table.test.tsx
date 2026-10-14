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

/**
 * Base UI commits an item only once it is highlighted (a real pointer hovers
 * it first), so a bare click is ignored: move onto it, then click.
 */
async function pickOption(name: string) {
  const option = await screen.findByRole('option', { name });
  fireEvent.mouseMove(option);
  fireEvent.click(option);
}

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

  it('is a select named for the person when levels are editable', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onLevelChange={vi.fn()}
      />,
    );
    const adaSelect = screen.getByRole('combobox', {
      name: 'Level for Ada Lovelace',
    });
    expect(adaSelect.textContent).toContain('INTER');
    // No level yet: a placeholder that says so, not a blank or "NONE".
    expect(
      screen.getByRole('combobox', { name: 'Level for Bob Hoover' })
        .textContent,
    ).toContain('No level');
  });

  it('hands the person and the picked level to onLevelChange', async () => {
    const onLevelChange = vi.fn();
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onLevelChange={onLevelChange}
      />,
    );
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Level for Ada Lovelace' }),
    );
    await pickOption('Advanced');
    expect(onLevelChange).toHaveBeenCalledWith('u1', 'advanced');
  });

  it('offers only the three levels — there is no way back to no level', async () => {
    render(
      <OfferingRosterTable
        users={[bob]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onLevelChange={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Level for Bob Hoover' }),
    );
    await screen.findByRole('option', { name: 'Basic' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Basic',
      'Intermediate',
      'Advanced',
    ]);
  });

  it('shows the saving row busy and locked', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onLevelChange={vi.fn()}
        savingUserId="u1"
      />,
    );
    const saving = screen.getByRole('combobox', {
      name: 'Level for Ada Lovelace',
    });
    expect(saving.getAttribute('aria-busy')).toBe('true');
    expect(
      saving.hasAttribute('disabled') ||
        saving.getAttribute('data-disabled') !== null,
    ).toBe(true);
    const idle = screen.getByRole('combobox', { name: 'Level for Bob Hoover' });
    expect(idle.getAttribute('aria-busy')).not.toBe('true');
  });

  it('renders read-only chips and says why without level:update', () => {
    render(
      <OfferingRosterTable
        users={[ada, bob]}
        onRemove={vi.fn()}
        canEditLevels={false}
        levelLockReason={() => null}
        onLevelChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
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
        onLevelChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('combobox', { name: 'Level for Ada Lovelace' }),
    ).toBeNull();
    expect(screen.getByText('INTER')).toBeTruthy();
    // Visible, and complete for assistive tech.
    expect(screen.getByText('Not in directory')).toBeTruthy();
    expect(screen.getByText('Not in the user directory')).toBeTruthy();
    expect(
      screen.getByRole('combobox', { name: 'Level for Bob Hoover' }),
    ).toBeTruthy();
  });

  it('states the view-only reason in the reviewed words', () => {
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels={false}
        onLevelChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Levels are view only here. Changing them needs an admin with the Levels “update” permission.',
      ),
    ).toBeTruthy();
  });

  it('greys a locked select with AA-safe tokens, not opacity', () => {
    render(
      <OfferingRosterTable
        users={[ada]}
        onRemove={vi.fn()}
        canEditLevels
        levelLockReason={() => null}
        onLevelChange={vi.fn()}
        disabled
      />,
    );
    const select = screen.getByRole('combobox', {
      name: 'Level for Ada Lovelace',
    });
    expect(select.hasAttribute('data-disabled')).toBe(true);
    expect(select.className).not.toMatch(/opacity/);
    expect(select.className).toContain('data-[disabled]:text-secondary');
  });
});
