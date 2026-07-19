import type { BoardLesson, BoardModule } from '@/lib/admin-schemas';
import type { SubscriptionType } from '@/types';

export type AvailabilityValue = 'public' | 'private';
export type AccessValue = 'free' | 'subscription';
export type DebriefValue = 'on' | 'off';

export const availabilityValue = (lesson: BoardLesson): AvailabilityValue =>
  lesson.isAvailable ? 'public' : 'private';

export const debriefValue = (lesson: BoardLesson): DebriefValue =>
  lesson.hasDebrief ? 'on' : 'off';

export const accessValue = (lesson: BoardLesson): AccessValue =>
  lesson.requiredSubscriptions.length > 0 ? 'subscription' : 'free';

/** A lesson can only inherit subscriptions if its module has any. */
export const isSubscriptionDisabled = (module: BoardModule): boolean =>
  module.requiredSubscriptions.length === 0;

/** Map an Access choice to the required_subscriptions array to persist. */
export const accessSubscriptions = (
  next: AccessValue,
  module: BoardModule,
): SubscriptionType[] =>
  next === 'subscription' ? [...module.requiredSubscriptions] : [];
