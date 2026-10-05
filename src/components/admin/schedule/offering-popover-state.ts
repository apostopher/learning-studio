/**
 * What the schedule's offering popover is doing.
 *
 * Three states, not two booleans: a preview (hovered, read-only, follows the
 * mouse) and a pinned popover (clicked, editable, still) are different
 * contracts with the user, and "open + pinned" as flags would admit a pinned
 * popover with nothing open.
 *
 * Pure so every rule below is unit-tested without a DOM. Timing (the 300 ms
 * hover delay) is NOT here — see `hover-intent.ts`.
 */
export type PopoverTarget =
  | { mode: 'edit'; offeringId: number }
  | { mode: 'create'; courseId: number; courseName: string; startsOn: string };

export type OfferingPopoverState =
  | { status: 'closed' }
  | { status: 'preview'; offeringId: number }
  | { status: 'pinned'; target: PopoverTarget; confirmingDiscard: boolean };

export type OfferingPopoverEvent =
  | { type: 'preview'; offeringId: number }
  | { type: 'leave'; offeringId: number }
  | { type: 'pin'; target: PopoverTarget }
  | { type: 'dismiss'; reason: 'escape' | 'outside'; dirty: boolean }
  | { type: 'keepEditing' }
  | { type: 'close' };

export const CLOSED: OfferingPopoverState = { status: 'closed' };

export function reduceOfferingPopover(
  state: OfferingPopoverState,
  event: OfferingPopoverEvent,
): OfferingPopoverState {
  switch (event.type) {
    case 'preview':
      // A pinned popover is being edited; hovering past other bars must not
      // yank it away.
      if (state.status === 'pinned') return state;
      if (state.status === 'preview' && state.offeringId === event.offeringId)
        return state;
      return { status: 'preview', offeringId: event.offeringId };

    case 'leave':
      return state.status === 'preview' && state.offeringId === event.offeringId
        ? CLOSED
        : state;

    case 'pin':
      // Pinned already: a clean popover was closed by the outside-press that
      // preceded this click, so reaching here means it is dirty and asking —
      // swapping in another offering would bury the question.
      if (state.status === 'pinned') return state;
      return {
        status: 'pinned',
        target: event.target,
        confirmingDiscard: false,
      };

    case 'dismiss':
      if (state.status === 'closed') return state;
      if (state.status === 'preview') {
        // Base UI reports outside-press on pointerdown, BEFORE the click on the
        // very bar being previewed. Closing here would make that click reopen
        // it — a visible flash. The pointer leaving closes a preview anyway.
        return event.reason === 'outside' ? state : CLOSED;
      }
      return event.dirty ? { ...state, confirmingDiscard: true } : CLOSED;

    case 'keepEditing':
      return state.status === 'pinned'
        ? { ...state, confirmingDiscard: false }
        : state;

    case 'close':
      return CLOSED;
  }
}
