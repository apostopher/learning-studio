import { describe, expect, it } from 'vitest';
import { offeringMonthLabel, pickViewerOffering } from '../viewer-offering';

const jan = { startsOn: '2026-01-05', endsOn: '2026-02-19' };
const jun = { startsOn: '2026-06-01', endsOn: '2026-07-16' };
const nov = { startsOn: '2026-11-26', endsOn: '2027-01-09' };

describe('pickViewerOffering', () => {
  it('names the offering running today', () => {
    expect(pickViewerOffering([jan, nov, jun], '2026-06-10')).toBe(jun);
  });

  it('else the next to start', () => {
    expect(pickViewerOffering([nov, jan, jun], '2026-03-01')).toBe(jun);
  });

  it('else the latest to have started', () => {
    expect(pickViewerOffering([jun, jan], '2026-12-01')).toBe(jun);
  });

  it('of two running at once, the later start', () => {
    const overlap = { startsOn: '2026-06-20', endsOn: '2026-08-01' };
    expect(pickViewerOffering([overlap, jun], '2026-06-25')).toBe(overlap);
  });

  it('is null for someone on no offering', () => {
    expect(pickViewerOffering([], '2026-06-10')).toBeNull();
  });
});

describe('offeringMonthLabel', () => {
  it('reads as month and year', () => {
    expect(offeringMonthLabel('2026-11-26')).toBe('November 2026');
  });
});
