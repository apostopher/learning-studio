import { describe, expect, it } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';
import {
  accessSubscriptions,
  accessValue,
  availabilityValue,
  debriefValue,
  isSubscriptionDisabled,
  isVideoWatchRequiredDisabled,
  videoWatchValue,
  videoWatchWarning,
} from '../config-mappings';

const lesson = (over: Partial<BoardLesson> = {}): BoardLesson => ({
  id: 10,
  name: 'L',
  slug: 'l',
  rank: 1,
  isAvailable: false,
  hasDebrief: true,
  needsVideoWatch: true,
  requiredSubscriptions: [],
  isConfigured: false,
  hasVideoId: false,
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
  dependsOn: [],
  learnerCount: 0,
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

  it('maps video watch', () => {
    expect(videoWatchValue(lesson({ needsVideoWatch: true }))).toBe('required');
    expect(videoWatchValue(lesson({ needsVideoWatch: false }))).toBe(
      'optional',
    );
  });

  it('disables Required only when there is no video AND it is not already set', () => {
    // The whole point of the rule: you may LEAVE an unsatisfiable state but not
    // ENTER one. A blanket "disable when no video" would grey out the SELECTED
    // option for the lessons already carrying needsVideoWatch with no video.
    expect(
      isVideoWatchRequiredDisabled(
        lesson({ isConfigured: false, needsVideoWatch: false }),
      ),
    ).toBe(true);
    expect(
      isVideoWatchRequiredDisabled(
        lesson({ isConfigured: false, needsVideoWatch: true }),
      ),
    ).toBe(false);
  });

  it('never disables Required when the lesson has a video', () => {
    for (const needsVideoWatch of [true, false]) {
      expect(
        isVideoWatchRequiredDisabled(
          lesson({ isConfigured: true, needsVideoWatch }),
        ),
      ).toBe(false);
    }
  });

  it('warns only when the lesson has no video, and distinguishes the two cases', () => {
    expect(videoWatchWarning(lesson({ isConfigured: true }))).toBeNull();
    // Not yet requirable — preventing a bad setting.
    expect(
      videoWatchWarning(
        lesson({ isConfigured: false, needsVideoWatch: false }),
      ),
    ).toMatch(/no video yet/i);
    // Already unsatisfiable — reporting an existing setting, and it must tell
    // the admin how to resolve it.
    const stuck = videoWatchWarning(
      lesson({ isConfigured: false, needsVideoWatch: true }),
    );
    expect(stuck).toMatch(/never be satisfied/i);
    expect(stuck).toMatch(/optional/i);
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
