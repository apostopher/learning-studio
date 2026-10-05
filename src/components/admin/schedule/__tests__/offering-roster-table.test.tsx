// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
