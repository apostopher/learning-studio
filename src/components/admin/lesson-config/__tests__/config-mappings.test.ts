import { describe, expect, it } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import {
  accessSubscriptions,
  accessValue,
  availabilityValue,
  debriefValue,
  isSubscriptionDisabled,
} from '../config-mappings';

const lesson = (over: Partial<BoardLesson> = {}): BoardLesson => ({
  id: 10,
  name: 'L',
  slug: 'l',
  rank: 1,
  isAvailable: false,
  hasDebrief: true,
  requiredSubscriptions: [],
  isConfigured: false,
  videoProvider: null,
  videoRef: null,
  ...over,
});

const module = (over: Partial<BoardModule> = {}): BoardModule => ({
  id: 1,
  name: 'M',
  slug: 'm',
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: 1,
  requiredSubscriptions: ['associate'],
  lessons: [],
  ...over,
});

describe('config-mappings', () => {
  it('maps availability', () => {
    expect(availabilityValue(lesson({ isAvailable: true }))).toBe('public');
    expect(availabilityValue(lesson({ isAvailable: false }))).toBe('private');
  });

  it('maps debrief', () => {
    expect(debriefValue(lesson({ hasDebrief: true }))).toBe('on');
    expect(debriefValue(lesson({ hasDebrief: false }))).toBe('off');
  });

  it('reads access from the lesson subscriptions', () => {
    expect(accessValue(lesson({ requiredSubscriptions: [] }))).toBe('free');
    expect(accessValue(lesson({ requiredSubscriptions: ['associate'] }))).toBe(
      'subscription',
    );
  });

  it('disables subscription only when the module is free', () => {
    expect(isSubscriptionDisabled(module({ requiredSubscriptions: [] }))).toBe(
      true,
    );
    expect(
      isSubscriptionDisabled(module({ requiredSubscriptions: ['rpoc'] })),
    ).toBe(false);
  });

  it('inherits the module subscriptions for subscription, clears for free', () => {
    const mod = module({ requiredSubscriptions: ['associate', 'candidate'] });
    expect(accessSubscriptions('subscription', mod)).toEqual([
      'associate',
      'candidate',
    ]);
    expect(accessSubscriptions('free', mod)).toEqual([]);
  });
});
