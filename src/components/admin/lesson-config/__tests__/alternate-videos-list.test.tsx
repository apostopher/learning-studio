// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlternateVideosList } from '../alternate-videos-list';

describe('AlternateVideosList', () => {
  it('says so, in text, when no languages are attached', () => {
    render(<AlternateVideosList rows={[]} onRemove={vi.fn()} />);
    expect(screen.getByText(/no other languages yet/i)).toBeTruthy();
  });

  it('lists each language with its provider and removes by lang', async () => {
    const onRemove = vi.fn();
    render(
      <AlternateVideosList
        rows={[
          {
            lang: 'fr-CA',
            label: 'Canadian French',
            providerLabel: 'Synthesia',
            removing: false,
          },
        ]}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('Canadian French')).toBeTruthy();
    expect(screen.getByText('Synthesia')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Canadian French' }),
    );
    expect(onRemove).toHaveBeenCalledWith('fr-CA');
  });
});
