// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferingDiscardConfirm } from '../offering-discard-confirm';
import { OfferingForm } from '../offering-form';

const base = {
  startsOn: '2026-09-23',
  onStartsOnChange: vi.fn(),
  windowDays: '45',
  onWindowDaysChange: vi.fn(),
  endsOn: '2026-11-06',
  onEndsOnChange: vi.fn(),
  summaryLine: '45 calendar days — 6 weeks and 3 days',
  rosterCount: '2 people',
  addPerson: <div />,
  rosterTable: <div />,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  isSaving: false,
  submitLabel: 'Save',
};

describe('OfferingForm (compact)', () => {
  it('labels the three date controls Start date / Window / Complete by', () => {
    render(<OfferingForm {...base} />);
    expect(
      (screen.getByLabelText('Start date') as HTMLInputElement).value,
    ).toBe('2026-09-23');
    expect((screen.getByLabelText('Window') as HTMLInputElement).value).toBe(
      '45',
    );
    expect(
      (screen.getByLabelText('Complete by') as HTMLInputElement).value,
    ).toBe('2026-11-06');
  });

  it('hands a window edit to the container', () => {
    const onWindowDaysChange = vi.fn();
    render(<OfferingForm {...base} onWindowDaysChange={onWindowDaysChange} />);
    fireEvent.change(screen.getByLabelText('Window'), {
      target: { value: '30' },
    });
    expect(onWindowDaysChange).toHaveBeenCalledWith('30');
  });

  it('a discard confirm replaces the Cancel / Save row', () => {
    const onDiscard = vi.fn();
    render(
      <OfferingForm
        {...base}
        discardConfirm={
          <OfferingDiscardConfirm
            onKeepEditing={vi.fn()}
            onDiscard={onDiscard}
          />
        }
      />,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
