// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported (for real, not mocked) by the drag-rules test.

import {
  accessSubscriptions,
  isSubscriptionDisabled,
} from '#/components/admin/lesson-config/config-mappings';
import type {
  EditorBoardLesson,
  EditorBoardModule,
  UpdateLessonConfigInput,
} from '#/lib/admin-schemas';
import type { LessonCardAccess } from './lesson-card';

/**
 * The accessible name and tooltip of a placed lesson's "remove" control.
 *
 * Lives here, shared, because two places have to agree on it: the control
 * itself (`LessonCard` via `EditorLessonCardContainer`) and the drag refusal
 * that tells someone to go and use it (`resolveDrop`). A refusal naming a
 * control by a label the control does not wear is worse than a refusal that
 * says nothing — the reader looks for a button that isn't there. One function,
 * so they cannot drift.
 *
 * Names the lesson as well as the module because the two destructive controls
 * on a card sit two icons apart, and "Remove" on its own says nothing about
 * what it removes the lesson FROM.
 */
export function removeLessonLabel(
  lessonName: string,
  moduleName: string,
): string {
  return `Remove ${lessonName} from ${moduleName}`;
}

/**
 * The eye's accessible name and tooltip: what students see, and what a click
 * does. A module other courses borrow is shown and hidden for them too, which
 * the click must say.
 */
export function visibilityLabel(isVisible: boolean, sharedWith = 0): string {
  const also =
    sharedWith === 0
      ? ''
      : ` here and in the ${sharedWith === 1 ? 'course' : `${sharedWith} courses`} sharing this module`;
  return isVisible
    ? `Visible to students. Hide it${also}`
    : `Hidden from students. Show it${also}`;
}

/**
 * The padlock's props for a placed lesson: paid when it requires any
 * subscription, locked open when its module is free.
 *
 * Shared by both boards' card containers so the rule lives once. Making a
 * lesson paid copies its module's subscriptions (`accessSubscriptions`); a
 * free module has none to copy, so the toggle there would write `[]` back and
 * appear to do nothing — it is inert and says why instead.
 */
export function lessonAccess(
  lesson: Pick<EditorBoardLesson, 'requiredSubscriptions'>,
  module: EditorBoardModule,
  save: (patch: Pick<UpdateLessonConfigInput, 'requiredSubscriptions'>) => void,
  isPending: boolean,
): LessonCardAccess {
  const isPaid = lesson.requiredSubscriptions.length > 0;
  return {
    isPaid,
    isPending,
    lockedReason: isSubscriptionDisabled(module)
      ? 'This module is free, so its lessons cannot be paid. Set the module’s access first.'
      : undefined,
    onToggle: () =>
      save({
        requiredSubscriptions: accessSubscriptions(
          isPaid ? 'free' : 'subscription',
          module,
        ),
      }),
  };
}
