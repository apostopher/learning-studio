# Schedule Offering Hover Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the schedule calendar's centred offering dialog with a compact popover. Hovering an offering shows a read-only preview that follows the mouse. Clicking pins it so it can be edited. The people table is sized for about 10 students and scrolls past that.

**Architecture:** One Base UI `Popover`, controlled by a jotai atom and positioned against a *virtual anchor* (no `Popover.Trigger`). A pure reducer owns the open, preview and pinned transitions. A pure, timer-injected "hover intent" object owns the 300 ms open delay and the short close grace. The anchor (where the cursor is) lives in its **own** atom, read only by a small positioner container. That way 60 pointer-moves a second re-position the popup without re-rendering the form.

**Tech Stack:** React 19, Base UI 1.4.1 (`@base-ui/react/popover`), jotai, react-hook-form + zod, TanStack Table, Tailwind v4, Vitest + Testing Library (jsdom), Storybook 10.

**Spec:** Agreed in conversation on 2026-10-05. The user's mockup is `~/Downloads/WhatsApp Image 2026-09-25 at 08.26.22.jpeg` (left = current, right = proposed). The agreed requirements are restated verbatim in Global Constraints below, so this plan carries its own spec.

## Global Constraints

- Layout: the explainer moves to small text at the top right beside the course title, reading exactly: `An offering is one dated run of a course. Each course can have multiple offerings.`
- Layout: **Start date**, **Window** and **Complete by** sit on ONE row. Window is a narrow number input. Labels read exactly `Start date`, `Window`, `Complete by`.
- Layout: the window summary line and the ground-school paragraph stay, below the date row. The divider above the roster is removed.
- The roster section (heading, search + Add, Name/Email/Level/Remove table) and the footer (Unschedule · Cancel · Save) keep their current behaviour.
- People table: **10 rows visible**, then it scrolls, with a sticky header. More than 10 people are allowed. There is no cap.
- Popup max size = form + 10-row table + padding. It never grows beyond that. With fewer people it is shorter. On a short viewport the popup itself scrolls and never overflows the screen.
- **Hover** (mouse only) an offering → preview after **300 ms**. The preview **follows the mouse**. It is read-only (`inert`).
- **Click** pins the popup in place. Only a pinned popup can be edited.
- Unpin: Cancel, Save (success), Unschedule (success), **Esc**, **click outside**. With unsaved edits, Esc or click outside shows an inline "discard?" confirm instead of closing.
- While pinned, hovering other offerings does nothing.
- Popover flips and shifts to stay on screen.
- Keyboard: focusing an offering shows the preview (anchored to the segment). **Enter** pins it. Touch: tap pins immediately, with no hover preview.
- Drag-a-course-onto-a-day (create) opens the **same** popover, already pinned, anchored to the day dropped on. (Decision taken in planning: one component, one layout. The old modal is deleted.)
- CSS: logical properties only (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, `inline-size`/`block-size` for flow-relative sizes).
- Colours: existing semantic tokens only (`gray-*`, `apple-*`, `error-*`, `text-primary/secondary/tertiary`). No new hues. Text must meet WCAG AA, and the repo's text tokens are AAA.
- State: jotai atoms. No `useState`/`useReducer`. `useRef` is allowed in containers for timers and DOM nodes.
- Presentational components stay hookless, except where they already use `useReactTable`.
- Tests import with `#/`, never `@/`. Use no jest-dom: assert with `.toBeNull()`, `.getAttribute()`, `.textContent`. Every render test file starts with `// @vitest-environment jsdom`.

## Review Focus

1. **Moving between the day-segments of ONE offering** (each day is its own `<button>`). The preview must not flicker or re-run the 300 ms delay. *Pinned by the `hover-intent` test "re-entering the same offering within the grace keeps it open" (Task 2).*
2. **Clicking a bar while its preview is showing.** Base UI fires `outside-press` on pointerdown before the click. If that closes the preview, the click re-opens it and the popup flashes. Expect: no close, it just pins. *Pinned by the reducer test "dismiss from outside-press while previewing is ignored" (Task 1).*
3. **Esc / click outside with unsaved edits.** Expect the confirm, never silent data loss. Clicking *another* bar while dirty must not pin that bar underneath the confirm. *Pinned by the reducer tests "dirty dismiss asks first" and "pin while pinned is ignored" (Task 1).*
4. **Keyboard Enter on a segment fires `click` with `clientX/clientY = 0`.** Anchoring to (0,0) would throw the popup to the top-left corner. Expect it to anchor to the segment element. *Pinned by the `popover-anchor` test "keyboard click (detail 0) anchors to the element" (Task 2).*
5. **Touch tap fires `pointerenter` before `click`.** A hover timer started by touch would open a preview the user never asked for. Expect: no preview, the tap pins. *Pinned by the `hover-intent` test "ignores non-mouse pointers" (Task 2).*

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/admin/schedule/offering-popover-state.ts` (create) | Types + pure reducer: closed / preview / pinned, discard confirm |
| `src/components/admin/schedule/popover-anchor.ts` (create) | Anchor type, `toVirtualElement`, `anchorFromPointerEvent` |
| `src/components/admin/schedule/hover-intent.ts` (create) | Pure, timer-injected open delay + close grace, mouse-only |
| `src/atoms/schedule.ts` (modify) | Replace `scheduleDialogAtom` with `offeringPopoverAtom` + `offeringPopoverAnchorAtom` |
| `src/components/admin/schedule/offering-window.ts` (modify) | Gains `formatOfferingRange` (moved out of the dialog container) |
| `src/components/admin/schedule/offering-form.tsx` (modify) | Compact one-row dates, no divider, discard-confirm slot |
| `src/components/admin/schedule/offering-roster-table.tsx` (modify) | Fixed row heights, sticky header, 10-row max then scroll |
| `src/components/admin/schedule/offering-discard-confirm.tsx` (create) | Inline "discard your changes?" bar |
| `src/components/admin/schedule/offering-popover-positioner-container.tsx` (create) | Reads the anchor atom, renders `Popover.Positioner` |
| `src/components/admin/schedule/offering-popover-container.tsx` (rename from `offering-dialog-container.tsx`) | Form/RHF/mutations + Popover shell |
| `src/components/admin/schedule/offering-segment.tsx` (modify) | Forwards pointer/focus/click events |
| `src/components/admin/schedule/schedule-day-container.tsx` (modify) | Wires segment events to the popover |
| `src/components/admin/schedule/schedule-page-container.tsx` (modify) | Drop → pinned create; owns the hover intent |
| `src/components/admin/schedule/offering-dialog.stories.tsx` → `offering-popover.stories.tsx` | Stories, incl. a 14-person roster |

---

### Task 1: Popover state reducer + atoms

**Files:**
- Create: `src/components/admin/schedule/offering-popover-state.ts`
- Modify: `src/atoms/schedule.ts` (replace `ScheduleDialogState`/`scheduleDialogAtom`, lines ~25–44)
- Test: `src/components/admin/schedule/__tests__/offering-popover-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
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
  export const CLOSED: OfferingPopoverState;
  export function reduceOfferingPopover(s: OfferingPopoverState, e: OfferingPopoverEvent): OfferingPopoverState;
  ```
  Atoms are in `#/atoms/schedule`: `offeringPopoverAtom` (an `atom<OfferingPopoverState>(CLOSED)` plus a write-only `dispatchOfferingPopoverAtom`) and `offeringPopoverAnchorAtom` (typed in Task 2; declare it in Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/admin/schedule/__tests__/offering-popover-state.test.ts
import { describe, expect, it } from 'vitest';
import {
  CLOSED,
  type OfferingPopoverState,
  reduceOfferingPopover as r,
} from '../offering-popover-state';

const edit7 = { mode: 'edit', offeringId: 7 } as const;
const pinned7: OfferingPopoverState = {
  status: 'pinned',
  target: edit7,
  confirmingDiscard: false,
};

describe('reduceOfferingPopover', () => {
  it('opens a preview from closed', () => {
    expect(r(CLOSED, { type: 'preview', offeringId: 7 })).toEqual({
      status: 'preview',
      offeringId: 7,
    });
  });

  it('switches preview straight to another offering', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'preview', offeringId: 9 })).toEqual({
      status: 'preview',
      offeringId: 9,
    });
  });

  it('leave closes only the offering being previewed', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'leave', offeringId: 9 })).toBe(s);
    expect(r(s, { type: 'leave', offeringId: 7 })).toEqual(CLOSED);
  });

  it('pins from preview and from closed', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'pin', target: edit7 })).toEqual(pinned7);
    expect(r(CLOSED, { type: 'pin', target: edit7 })).toEqual(pinned7);
  });

  it('ignores hover and leave while pinned', () => {
    expect(r(pinned7, { type: 'preview', offeringId: 9 })).toBe(pinned7);
    expect(r(pinned7, { type: 'leave', offeringId: 7 })).toBe(pinned7);
  });

  it('pin while pinned is ignored (a dirty confirm must not be swapped out)', () => {
    const confirming = { ...pinned7, confirmingDiscard: true };
    expect(
      r(confirming, { type: 'pin', target: { mode: 'edit', offeringId: 9 } }),
    ).toBe(confirming);
  });

  it('dismiss from outside-press while previewing is ignored', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'dismiss', reason: 'outside', dirty: false })).toBe(s);
  });

  it('escape closes a preview', () => {
    const s = r(CLOSED, { type: 'preview', offeringId: 7 });
    expect(r(s, { type: 'dismiss', reason: 'escape', dirty: false })).toEqual(
      CLOSED,
    );
  });

  it('clean dismiss closes a pinned popover', () => {
    expect(
      r(pinned7, { type: 'dismiss', reason: 'outside', dirty: false }),
    ).toEqual(CLOSED);
  });

  it('dirty dismiss asks first, keepEditing withdraws the question', () => {
    const asking = r(pinned7, { type: 'dismiss', reason: 'escape', dirty: true });
    expect(asking).toEqual({ ...pinned7, confirmingDiscard: true });
    expect(r(asking, { type: 'keepEditing' })).toEqual(pinned7);
  });

  it('close always closes', () => {
    expect(r({ ...pinned7, confirmingDiscard: true }, { type: 'close' })).toEqual(
      CLOSED,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/offering-popover-state.test.ts`
Expected: FAIL with "Failed to resolve import '../offering-popover-state'".

- [ ] **Step 3: Write the implementation**

```ts
// src/components/admin/schedule/offering-popover-state.ts
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
      return { status: 'pinned', target: event.target, confirmingDiscard: false };

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
```

Then replace the dialog atom in `src/atoms/schedule.ts`. Delete `ScheduleDialogState` and `scheduleDialogAtom` with their doc comment, and append:

```ts
import {
  CLOSED,
  type OfferingPopoverEvent,
  type OfferingPopoverState,
  reduceOfferingPopover,
} from '#/components/admin/schedule/offering-popover-state';

/**
 * The offering popover's state — closed, previewing on hover, or pinned for
 * editing. Written only through `dispatchOfferingPopoverAtom` so every change
 * passes the reducer's rules.
 */
export const offeringPopoverAtom = atom<OfferingPopoverState>(CLOSED);

export const dispatchOfferingPopoverAtom = atom(
  null,
  (get, set, event: OfferingPopoverEvent) => {
    set(offeringPopoverAtom, reduceOfferingPopover(get(offeringPopoverAtom), event));
  },
);
```

(Move the new `import` to the top of the file with the existing imports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/offering-popover-state.test.ts`
Expected: PASS, 11 tests.

`tsc` will now fail in the three files that import `scheduleDialogAtom`. That is expected: Tasks 4–5 rewrite them. Do **not** commit a broken build. Instead keep a temporary alias at the bottom of `src/atoms/schedule.ts`:

```ts
// TEMPORARY — removed in Task 5 once nothing imports it.
export type ScheduleDialogState =
  | { mode: 'create'; courseId: number; courseName: string; startsOn: string }
  | { mode: 'edit'; offeringId: number }
  | null;
export const scheduleDialogAtom = atom<ScheduleDialogState>(null);
```

Run: `pnpm tsc --noEmit` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/schedule/offering-popover-state.ts src/components/admin/schedule/__tests__/offering-popover-state.test.ts src/atoms/schedule.ts
git commit -m "feat(schedule): popover state reducer — preview, pinned, discard confirm"
```

---

### Task 2: Anchor + hover intent

**Files:**
- Create: `src/components/admin/schedule/popover-anchor.ts`
- Create: `src/components/admin/schedule/hover-intent.ts`
- Modify: `src/atoms/schedule.ts` (add `offeringPopoverAnchorAtom`)
- Test: `src/components/admin/schedule/__tests__/popover-anchor.test.ts`
- Test: `src/components/admin/schedule/__tests__/hover-intent.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  // popover-anchor.ts
  export type PopoverAnchor =
    | { kind: 'cursor'; element: Element; offsetX: number; offsetY: number }
    | { kind: 'element'; element: Element }
    | { kind: 'rect'; left: number; top: number; width: number; height: number };
  export type VirtualAnchor = { getBoundingClientRect: () => DOMRect; contextElement?: Element };
  export function toVirtualElement(anchor: PopoverAnchor): VirtualAnchor;
  export function anchorFromPointerEvent(
    element: Element,
    event: { clientX: number; clientY: number; detail?: number },
  ): PopoverAnchor;
  // hover-intent.ts
  export const HOVER_OPEN_DELAY_MS = 300;
  export const HOVER_CLOSE_GRACE_MS = 120;
  export type HoverIntent = {
    enter: (offeringId: number, pointerType: string, isPreviewing: boolean) => void;
    leave: (offeringId: number, pointerType: string) => void;
    cancel: () => void;
  };
  export function createHoverIntent(deps: {
    onOpen: (offeringId: number) => void;
    onClose: (offeringId: number) => void;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (id: unknown) => void;
  }): HoverIntent;
  // atoms/schedule.ts
  export const offeringPopoverAnchorAtom: PrimitiveAtom<PopoverAnchor | null>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/admin/schedule/__tests__/popover-anchor.test.ts
import { describe, expect, it } from 'vitest';
import { anchorFromPointerEvent, toVirtualElement } from '../popover-anchor';

const el = (left: number, top: number) =>
  ({
    getBoundingClientRect: () => new DOMRect(left, top, 40, 20),
  }) as unknown as Element;

describe('popover anchor', () => {
  it('a cursor anchor is a zero-size rect at the cursor, tracking its element', () => {
    const element = el(100, 200);
    const anchor = anchorFromPointerEvent(element, { clientX: 130, clientY: 205, detail: 1 });
    expect(anchor).toEqual({ kind: 'cursor', element, offsetX: 30, offsetY: 5 });
    const rect = toVirtualElement(anchor).getBoundingClientRect();
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([130, 205, 0, 0]);
  });

  it('follows the element when it scrolls (offset is relative)', () => {
    let top = 200;
    const element = { getBoundingClientRect: () => new DOMRect(100, top, 40, 20) } as unknown as Element;
    const v = toVirtualElement({ kind: 'cursor', element, offsetX: 30, offsetY: 5 });
    top = 150;
    expect(v.getBoundingClientRect().y).toBe(155);
  });

  it('keyboard click (detail 0) anchors to the element', () => {
    const element = el(100, 200);
    expect(anchorFromPointerEvent(element, { clientX: 0, clientY: 0, detail: 0 })).toEqual({
      kind: 'element',
      element,
    });
  });

  it('a rect anchor is fixed', () => {
    const r = toVirtualElement({ kind: 'rect', left: 1, top: 2, width: 3, height: 4 }).getBoundingClientRect();
    expect([r.x, r.y, r.width, r.height]).toEqual([1, 2, 3, 4]);
  });
});
```

```ts
// src/components/admin/schedule/__tests__/hover-intent.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHoverIntent, HOVER_CLOSE_GRACE_MS, HOVER_OPEN_DELAY_MS } from '../hover-intent';

describe('createHoverIntent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    return { onOpen, onClose, intent: createHoverIntent({ onOpen, onClose }) };
  };

  it('opens after the delay, not before', () => {
    const { onOpen, intent } = setup();
    intent.enter(7, 'mouse', false);
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 1);
    expect(onOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it('sweeping across without stopping opens nothing', () => {
    const { onOpen, intent } = setup();
    intent.enter(7, 'mouse', false);
    vi.advanceTimersByTime(100);
    intent.leave(7, 'mouse');
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('switches immediately when a preview is already showing', () => {
    const { onOpen, intent } = setup();
    intent.enter(9, 'mouse', true);
    expect(onOpen).toHaveBeenCalledWith(9);
  });

  it('re-entering the same offering within the grace keeps it open', () => {
    const { onClose, intent } = setup();
    intent.leave(7, 'mouse'); // left day 3 of the bar…
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE_MS - 10);
    intent.enter(7, 'mouse', true); // …onto day 4
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes after the grace when the pointer really left', () => {
    const { onClose, intent } = setup();
    intent.leave(7, 'mouse');
    vi.advanceTimersByTime(HOVER_CLOSE_GRACE_MS);
    expect(onClose).toHaveBeenCalledWith(7);
  });

  it('ignores non-mouse pointers', () => {
    const { onOpen, onClose, intent } = setup();
    intent.enter(7, 'touch', false);
    intent.enter(7, 'pen', false);
    intent.leave(7, 'touch');
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel drops pending timers', () => {
    const { onOpen, intent } = setup();
    intent.enter(7, 'mouse', false);
    intent.cancel();
    vi.advanceTimersByTime(1000);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/popover-anchor.test.ts src/components/admin/schedule/__tests__/hover-intent.test.ts`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Write the implementations**

```ts
// src/components/admin/schedule/popover-anchor.ts
/**
 * Where the offering popover points.
 *
 * `cursor` is stored as an offset INSIDE the hovered segment, not as raw
 * viewport coordinates: the calendar scrolls, and a pinned popover anchored to
 * a viewport point would stay put while the bar it describes slid away.
 * `element` is for keyboard (no pointer position exists); `rect` is the day a
 * course was dropped on, captured once at drop time.
 */
export type PopoverAnchor =
  | { kind: 'cursor'; element: Element; offsetX: number; offsetY: number }
  | { kind: 'element'; element: Element }
  | { kind: 'rect'; left: number; top: number; width: number; height: number };

export type VirtualAnchor = {
  getBoundingClientRect: () => DOMRect;
  contextElement?: Element;
};

export function toVirtualElement(anchor: PopoverAnchor): VirtualAnchor {
  switch (anchor.kind) {
    case 'cursor':
      return {
        contextElement: anchor.element,
        getBoundingClientRect: () => {
          const box = anchor.element.getBoundingClientRect();
          return new DOMRect(box.left + anchor.offsetX, box.top + anchor.offsetY, 0, 0);
        },
      };
    case 'element':
      return {
        contextElement: anchor.element,
        getBoundingClientRect: () => anchor.element.getBoundingClientRect(),
      };
    case 'rect':
      return {
        getBoundingClientRect: () =>
          new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height),
      };
  }
}

/**
 * A keyboard-activated click (Enter/Space on the segment) reports `detail` 0
 * and coordinates (0, 0) — anchoring to that would throw the popover into
 * the top-left corner. Those anchor to the segment itself.
 */
export function anchorFromPointerEvent(
  element: Element,
  event: { clientX: number; clientY: number; detail?: number },
): PopoverAnchor {
  if (event.detail === 0) return { kind: 'element', element };
  const box = element.getBoundingClientRect();
  return {
    kind: 'cursor',
    element,
    offsetX: event.clientX - box.left,
    offsetY: event.clientY - box.top,
  };
}
```

```ts
// src/components/admin/schedule/hover-intent.ts
/**
 * Hover timing for the offering preview.
 *
 * Open delay: sweeping the mouse across a busy calendar must not flash a
 * popover over every bar it crosses. Close grace: every DAY of an offering is
 * its own button, so moving along one bar is a leave + enter per day; without
 * the grace the preview would blink at each day boundary.
 *
 * Mouse only. Touch fires pointerenter before its click, and a preview the
 * finger can never move away from is noise — a tap pins instead. Pen is
 * treated like touch for the same reason.
 *
 * Timers are injectable so tests drive them with fake timers and so nothing
 * here touches React.
 */
export const HOVER_OPEN_DELAY_MS = 300;
export const HOVER_CLOSE_GRACE_MS = 120;

export type HoverIntent = {
  enter: (offeringId: number, pointerType: string, isPreviewing: boolean) => void;
  leave: (offeringId: number, pointerType: string) => void;
  cancel: () => void;
};

export function createHoverIntent({
  onOpen,
  onClose,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}: {
  onOpen: (offeringId: number) => void;
  onClose: (offeringId: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}): HoverIntent {
  let openTimer: unknown = null;
  let closeTimer: unknown = null;
  const clearOpen = () => {
    if (openTimer !== null) clearTimer(openTimer);
    openTimer = null;
  };
  const clearClose = () => {
    if (closeTimer !== null) clearTimer(closeTimer);
    closeTimer = null;
  };

  return {
    enter(offeringId, pointerType, isPreviewing) {
      if (pointerType !== 'mouse') return;
      clearClose();
      clearOpen();
      // Already showing a preview: the user has shown intent, so moving to a
      // neighbouring bar answers at once, the way tooltip groups behave.
      if (isPreviewing) {
        onOpen(offeringId);
        return;
      }
      openTimer = setTimer(() => {
        openTimer = null;
        onOpen(offeringId);
      }, HOVER_OPEN_DELAY_MS);
    },
    leave(offeringId, pointerType) {
      if (pointerType !== 'mouse') return;
      clearOpen();
      clearClose();
      closeTimer = setTimer(() => {
        closeTimer = null;
        onClose(offeringId);
      }, HOVER_CLOSE_GRACE_MS);
    },
    cancel() {
      clearOpen();
      clearClose();
    },
  };
}
```

Add to `src/atoms/schedule.ts`:

```ts
import type { PopoverAnchor } from '#/components/admin/schedule/popover-anchor';

/**
 * Where the offering popover points. Its OWN atom, apart from
 * `offeringPopoverAtom`, because a preview follows the mouse: pointermove
 * writes here ~60 times a second, and only the positioner reads it — the form
 * inside the popover must not re-render on every pixel.
 */
export const offeringPopoverAnchorAtom = atom<PopoverAnchor | null>(null);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/popover-anchor.test.ts src/components/admin/schedule/__tests__/hover-intent.test.ts`
Expected: PASS, 4 + 7 tests. (If jsdom's `DOMRect` is missing, add `// @vitest-environment jsdom` as line 1 of `popover-anchor.test.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/schedule/popover-anchor.ts src/components/admin/schedule/hover-intent.ts src/components/admin/schedule/__tests__/popover-anchor.test.ts src/components/admin/schedule/__tests__/hover-intent.test.ts src/atoms/schedule.ts
git commit -m "feat(schedule): cursor-following popover anchor and hover intent timing"
```

---

### Task 3: Compact form, 10-row roster, discard confirm (presentational)

**Files:**
- Modify: `src/components/admin/schedule/offering-form.tsx`
- Modify: `src/components/admin/schedule/offering-roster-table.tsx`
- Create: `src/components/admin/schedule/offering-discard-confirm.tsx`
- Rename + modify: `offering-dialog.stories.tsx` → `offering-popover.stories.tsx`
- Test: `src/components/admin/schedule/__tests__/offering-form.test.tsx`

**Interfaces:**
- Produces: `OfferingForm` keeps every existing prop and **adds**:
  - `startsOnRef?: Ref<HTMLInputElement>`: the container focuses this when the popover pins.
  - `discardConfirm?: ReactNode`: when present it **replaces** the footer button row.
- `OfferingDiscardConfirm({ onKeepEditing, onDiscard }: { onKeepEditing: () => void; onDiscard: () => void })`.
- `OfferingRosterTable` props unchanged. Exports `ROSTER_VISIBLE_ROWS = 10`.

- [ ] **Step 1: Write the failing test**

`OfferingForm` and `OfferingDiscardConfirm` are hookless, so they render in jsdom without the react shim. The test asserts what the *consumer* receives: callbacks fire with values, and the confirm replaces the buttons.

```tsx
// src/components/admin/schedule/__tests__/offering-form.test.tsx
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
    expect((screen.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-09-23');
    expect((screen.getByLabelText('Window') as HTMLInputElement).value).toBe('45');
    expect((screen.getByLabelText('Complete by') as HTMLInputElement).value).toBe('2026-11-06');
  });

  it('hands a window edit to the container', () => {
    const onWindowDaysChange = vi.fn();
    render(<OfferingForm {...base} onWindowDaysChange={onWindowDaysChange} />);
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '30' } });
    expect(onWindowDaysChange).toHaveBeenCalledWith('30');
  });

  it('a discard confirm replaces the Cancel / Save row', () => {
    const onDiscard = vi.fn();
    render(
      <OfferingForm
        {...base}
        discardConfirm={<OfferingDiscardConfirm onKeepEditing={vi.fn()} onDiscard={onDiscard} />}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/offering-form.test.tsx`
Expected: FAIL. `offering-discard-confirm` is unresolved, and "Window" is not found because the label is still "Completion window — calendar days".

- [ ] **Step 3: Implement**

`src/components/admin/schedule/offering-discard-confirm.tsx`:

```tsx
/**
 * Asked when a pinned offering with unsaved edits is dismissed by Esc or a
 * click outside. Inline rather than a nested dialog: it is a question ABOUT
 * this popover, so it lives in the popover's footer where the buttons it
 * replaces were.
 *
 * `autoFocus` on "Keep editing" — the safe answer takes focus, so a second
 * stray Esc or Enter cannot throw the work away.
 */
export const OfferingDiscardConfirm = ({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) => (
  <div
    role="group"
    aria-labelledby="offering-discard-question"
    className="flex flex-wrap items-center gap-2 rounded-lg border border-error-7 bg-error-3 px-3 py-2"
  >
    <p id="offering-discard-question" className="me-auto text-error-text text-sm">
      You have unsaved changes to this offering.
    </p>
    <button
      type="button"
      // biome-ignore lint/a11y/noAutofocus: the safe choice must take focus — see doc comment
      autoFocus
      onClick={onKeepEditing}
      className="rounded-lg border border-gray-6 bg-gray-2 px-3 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      Keep editing
    </button>
    <button
      type="button"
      onClick={onDiscard}
      className="rounded-lg px-3 py-1.5 font-medium text-error-text text-sm transition-colors hover:bg-error-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9"
    >
      Discard changes
    </button>
  </div>
);
```

`offering-form.tsx` changes:

1. Add `import type { ReactNode, Ref } from 'react';` (replacing the `ReactNode`-only import) and the props `startsOnRef?: Ref<HTMLInputElement>` and `discardConfirm?: ReactNode`, with doc comments as in Interfaces.
2. Change the form's `className` to `"flex flex-col gap-4"`.
3. Replace the three stacked field `<div>`s with one row. The labels are shorter but the ids stay the same:

```tsx
<div className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] items-start gap-2.5">
  <div className="flex flex-col gap-1.5">
    <label htmlFor="offering-starts-on" className={labelClassName}>Start date</label>
    <input
      ref={startsOnRef}
      id="offering-starts-on"
      type="date"
      value={startsOn}
      onChange={(event) => onStartsOnChange(event.target.value)}
      aria-invalid={startsOnError ? true : undefined}
      aria-describedby={startsOnError ? 'offering-starts-on-error' : undefined}
      className={fieldClassName(Boolean(startsOnError))}
    />
  </div>
  <div className="flex flex-col gap-1.5">
    {/* "Window" alone on screen; the unit is spoken via the hint the input
        is described by, and printed in the summary line beneath. */}
    <label htmlFor="offering-window-days" className={labelClassName}>Window</label>
    <input
      id="offering-window-days"
      type="number"
      inputMode="numeric"
      min={1}
      value={windowDays}
      onChange={(event) => onWindowDaysChange(event.target.value)}
      aria-describedby="offering-window-unit offering-window-hint"
      className={fieldClassName(false)}
    />
    <span id="offering-window-unit" className="sr-only">calendar days</span>
  </div>
  <div className="flex flex-col gap-1.5">
    <label htmlFor="offering-ends-on" className={labelClassName}>Complete by</label>
    <input
      id="offering-ends-on"
      type="date"
      value={endsOn}
      min={startsOn || undefined}
      onChange={(event) => onEndsOnChange(event.target.value)}
      aria-invalid={endsOnError ? true : undefined}
      aria-describedby={endsOnError ? 'offering-ends-on-error' : undefined}
      className={fieldClassName(Boolean(endsOnError))}
    />
  </div>
</div>
{/* Errors under the row, full width: in a 3-column row a message under one
    narrow field would wrap to a word per line. */}
{startsOnError && (
  <p id="offering-starts-on-error" role="alert" className="-mt-2 text-error-text text-sm">{startsOnError}</p>
)}
{endsOnError && (
  <p id="offering-ends-on-error" role="alert" className="-mt-2 text-error-text text-sm">{endsOnError}</p>
)}
```

4. In `fieldClassName`, change `px-3.5 py-2.5` to `px-3 py-2`. The compact row needs the room, and the inputs still clear a 40 px target.
5. Roster wrapper: change `"flex flex-col gap-3 border-gray-6 border-t pt-5"` to `"flex flex-col gap-3"`, which removes the divider.
6. Footer: wrap the existing button row as `{discardConfirm ?? (<div className="flex items-center gap-2 pt-1">…existing buttons…</div>)}`.
7. Update the component doc comment's first line: `The offering popover's body.`

`offering-roster-table.tsx` changes:

```tsx
/**
 * Rows the table shows before it scrolls. The popover's maximum size is
 * defined as "the form plus this many people", so the row and header heights
 * below are FIXED — a computed max height only means something if the rows
 * it counts are a known size.
 */
export const ROSTER_VISIBLE_ROWS = 10;
const ROW_REM = 2.5; // h-10
const HEAD_REM = 2; // h-8
```

- Wrap the `<table>` in a scroll container that replaces the current `overflow-hidden` div:

```tsx
<div
  className="overflow-y-auto overscroll-contain rounded-lg border border-gray-6"
  // Inline because Tailwind cannot build a class from these constants. The
  // trailing px is one border per row, so the 10th row is fully visible.
  style={{ maxBlockSize: `calc(${HEAD_REM}rem + ${ROSTER_VISIBLE_ROWS} * ${ROW_REM}rem + ${ROSTER_VISIBLE_ROWS}px)` }}
  // Scrollable region must be reachable and named for keyboard users.
  tabIndex={0}
  role="region"
  aria-label="People on this offering"
>
```

  Native `overflow-y-auto` here, not the shared `ScrollArea`: `ScrollArea`'s root is `block-size: 100%`, which needs a definite-height parent, and this box's whole point is to be content-sized up to a cap. Put that reason in a one-line comment.
- `<thead className="sticky top-0 z-[1] bg-gray-3">`. The physical `top` is fine here because sticky offset is block-axis and Tailwind has no logical `top` utility in v4 (`inset-bs-*` does not exist). Document this with a comment, per CLAUDE.md exceptions.
- Header `<tr className="h-8">`. Body `<tr className="h-10 border-gray-6 border-t bg-gray-1 hover:bg-gray-2">`. Cells `py-0` (padding moves to the fixed height): body `px-3 py-0 align-middle`, header `px-3 py-0`.

Stories: `git mv src/components/admin/schedule/offering-dialog.stories.tsx src/components/admin/schedule/offering-popover.stories.tsx`. Then:
- `title: 'Admin/Schedule/OfferingPopover'`.
- Wrap each story's render in `<div className="w-[34rem] rounded-xl border border-gray-6 bg-gray-2 p-5">` so the story shows the real popover width.
- Add a `FourteenPeople` story whose roster is `ROSTER` plus 9 more generated rows (`Array.from({ length: 9 }, (_, i) => ({ userId: \`x${i}\`, name: \`Student ${i + 6}\`, email: \`student${i + 6}@example.com\`, level: null }))`).
- Add a `DiscardConfirm` story that passes `discardConfirm={<OfferingDiscardConfirm onKeepEditing={() => {}} onDiscard={() => {}} />}`.

- [ ] **Step 4: Run tests and check visually**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/offering-form.test.tsx`
Expected: PASS, 3 tests.

Run: `pnpm storybook`. Open `Admin/Schedule/OfferingPopover` → `FourteenPeople`. Check:
- The dates sit on one row.
- Exactly 10 rows are visible. The 11th is cut by the scroll edge.
- The header stays visible while scrolling.
- There is no divider above "On this offering".
- `DiscardConfirm` replaces the buttons.

Check light and dark (the toolbar theme toggle).

Run: `pnpm tsc --noEmit && pnpm lint`. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/schedule/offering-form.tsx src/components/admin/schedule/offering-roster-table.tsx src/components/admin/schedule/offering-discard-confirm.tsx src/components/admin/schedule/offering-popover.stories.tsx src/components/admin/schedule/__tests__/offering-form.test.tsx
git add -u src/components/admin/schedule/offering-dialog.stories.tsx
git commit -m "feat(schedule): compact offering form — one-row dates, 10-row scrolling roster, discard confirm"
```

---

### Task 4: Popover shell (replaces the dialog)

**Files:**
- Rename: `offering-dialog-container.tsx` → `offering-popover-container.tsx` (`git mv`)
- Create: `src/components/admin/schedule/offering-popover-positioner-container.tsx`
- Modify: `src/components/admin/schedule/offering-window.ts` (receives `formatOfferingRange`)
- Modify: `src/components/admin/schedule/schedule-day-container.tsx` (import path only, line 4)

**Interfaces:**
- Consumes: `offeringPopoverAtom`, `dispatchOfferingPopoverAtom`, `offeringPopoverAnchorAtom` (Tasks 1–2). `toVirtualElement` (Task 2). `OfferingForm` with `startsOnRef` + `discardConfirm`, and `OfferingDiscardConfirm` (Task 3).
- Produces: `OfferingPopoverContainer({ offerings }: { offerings: Offering[] })`. `formatOfferingRange(offering: Offering): string` is exported from `./offering-window`.

- [ ] **Step 1: Move `formatOfferingRange`**

Cut `formatOfferingRange` (with its doc comment and its `format` import) from the container to the bottom of `offering-window.ts`. Add `import { format } from 'date-fns'` there if it is not already present, and `import type { Offering } from '#/lib/offering-schemas'`. In `schedule-day-container.tsx`, change the import to `import { formatOfferingRange } from './offering-window';`.

Run: `pnpm tsc --noEmit`. Expected: clean.

- [ ] **Step 2: Positioner container**

```tsx
// src/components/admin/schedule/offering-popover-positioner-container.tsx
import { Popover } from '@base-ui/react/popover';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { offeringPopoverAnchorAtom } from '#/atoms/schedule';
import { toVirtualElement } from './popover-anchor';

/**
 * The only reader of the anchor atom. While previewing, pointermove rewrites
 * the anchor every frame; isolating the read here means only this element
 * re-renders — `children` (the whole form) is created by the parent and keeps
 * its identity, so React skips it.
 *
 * `side="right"` keeps the popover beside the cursor rather than under it, so
 * it never covers the bar being pointed at; Base UI's collision avoidance
 * flips it left near the screen edge and shifts it vertically to fit.
 */
export const OfferingPopoverPositionerContainer = ({
  children,
}: {
  children: ReactNode;
}) => {
  const anchor = useAtomValue(offeringPopoverAnchorAtom);
  return (
    <Popover.Positioner
      anchor={anchor ? toVirtualElement(anchor) : null}
      side="right"
      align="start"
      sideOffset={16}
      collisionPadding={16}
      className="z-50"
    >
      {children}
    </Popover.Positioner>
  );
};
```

- [ ] **Step 3: Rewrite the container's state wiring**

`git mv src/components/admin/schedule/offering-dialog-container.tsx src/components/admin/schedule/offering-popover-container.tsx`, then make the following changes in that file.

a) Imports: replace `Dialog` with `import { Popover } from '@base-ui/react/popover';`. Replace `scheduleDialogAtom` with `dispatchOfferingPopoverAtom, offeringPopoverAnchorAtom, offeringPopoverAtom` from `#/atoms/schedule`. Add `useAtomValue, useSetAtom` from jotai. Import `OfferingDiscardConfirm` and `OfferingPopoverPositionerContainer`.

b) Derive the old `dialog` shape from the popover state, so the existing seeding, `results`, add/remove and submit logic stays untouched:

```tsx
const popover = useAtomValue(offeringPopoverAtom);
const dispatch = useSetAtom(dispatchOfferingPopoverAtom);
const anchor = useAtomValue(offeringPopoverAnchorAtom);

// The old dialog's two modes, read from whichever state is showing. A preview
// is always an existing offering — you can only hover what is on the calendar.
const dialog =
  popover.status === 'preview'
    ? ({ mode: 'edit', offeringId: popover.offeringId } as const)
    : popover.status === 'pinned'
      ? popover.target
      : null;
const isPinned = popover.status === 'pinned';
```

Rename the component to `OfferingPopoverContainer`. Update its doc comment: "The popover a bar's hover previews and its click pins, and that a drop opens already pinned…" (keep the paragraph about resolving the offering from the on-screen list).

c) `close` becomes:

```tsx
const close = () => {
  dispatch({ type: 'close' });
  form.reset({ startsOn: '', endsOn: '', users: [] });
  setPersonQuery('');
  setSelectedPerson(null);
  create.reset();
  update.reset();
  remove.reset();
};
```

Every existing `close()` call site (Cancel, both `onSuccess`es, `handleDelete` success) stays as is.

d) Preview → closed and preview → another offering must not leave a dirty form behind. A preview is never dirty because it is `inert`. Still, the seeding `values` with `keepDirtyValues` would carry edits from a pinned A into a later preview of B if `close` were skipped. `close` always runs on every exit from pinned, so this holds. Add a one-line comment at `close` saying so.

e) Replace the whole `return (<Dialog.Root …>)` with:

```tsx
const isDirty = form.formState.isDirty;

return (
  <Popover.Root
    open={dialog !== null}
    onOpenChange={(open, details) => {
      if (open) return;
      // Only dismissals reach here — this popover has no Trigger, so Base UI
      // never asks to open it. Every exit path goes through the reducer.
      if (details.reason === 'escape-key' || details.reason === 'outside-press') {
        // A clean pinned popover closes through `close` so the form and the
        // mutations reset; everything else (preview, or a dirty pin that must
        // ask first) is the reducer's call.
        if (popover.status === 'pinned' && !isDirty) close();
        else
          dispatch({
            type: 'dismiss',
            reason: details.reason === 'escape-key' ? 'escape' : 'outside',
            dirty: isDirty,
          });
      }
    }}
  >
    <Popover.Portal>
      <OfferingPopoverPositionerContainer>
        <Popover.Popup
          // A preview must not take focus from the bar the keyboard is on;
          // pinning moves focus itself (see `pinAndFocus` in the page).
          initialFocus={false}
          // Back to the segment the popover came from when it was pinned from
          // the keyboard; for a mouse or a drop there is nothing to return to.
          finalFocus={() =>
            anchor && anchor.kind !== 'rect' && anchor.element instanceof HTMLElement
              ? anchor.element
              : false
          }
          // A preview is a picture of the offering, not a form: inert removes
          // it from the tab order and the accessibility tree, and
          // pointer-events-none keeps a cursor that catches up with it from
          // hovering its controls.
          inert={!isPinned || undefined}
          className={cn(
            'offering-popover flex max-h-[var(--available-height)] w-[min(34rem,calc(100vw-2rem))] flex-col overflow-y-auto overscroll-contain rounded-xl border border-gray-6 bg-gray-2 p-5 shadow-xl',
            !isPinned && 'pointer-events-none',
          )}
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <Popover.Title className="font-semibold text-accent-text text-lg">
              {courseName}
            </Popover.Title>
            <Popover.Description className="max-w-[16rem] text-end text-secondary text-xs">
              An offering is one dated run of a course. Each course can have
              multiple offerings.
            </Popover.Description>
          </div>
          <OfferingForm
            startsOnRef={(node) => {
              offeringPopoverFirstField.current = node;
            }}
            /* …every existing prop unchanged… */
            discardConfirm={
              popover.status === 'pinned' && popover.confirmingDiscard ? (
                <OfferingDiscardConfirm
                  onKeepEditing={() => dispatch({ type: 'keepEditing' })}
                  onDiscard={close}
                />
              ) : undefined
            }
          />
        </Popover.Popup>
      </OfferingPopoverPositionerContainer>
    </Popover.Portal>
  </Popover.Root>
);
```

Import `cn` from `#/lib/cn`. If `Popover.Popup` rejects `inert` as a prop type, spread it: `{...(!isPinned ? { inert: true } : {})}`. React 19 supports `inert` as a boolean.

f) Above the component, declare the focus handle that the `startsOnRef` callback in (e) writes to. The page focuses it after pinning, without prop drilling:

```tsx
/**
 * The pinned popover's first field. The page focuses it right after a pin —
 * Base UI's `initialFocus` only runs on open, and a preview → pinned change
 * is not an open. A module ref is fine: the popover is a singleton.
 */
export const offeringPopoverFirstField: { current: HTMLInputElement | null } = { current: null };
```

g) Add the popover's enter/exit style to `src/styles.css` next to `.dialog-popup` (~line 1479), in the same `@layer`:

```css
/* Offering popover: fade + slight scale on open/close only. Never transitions
   position — a preview follows the cursor, and easing that would make it lag. */
.offering-popover {
  transform-origin: var(--transform-origin);
  transition: opacity 120ms var(--ease-out, ease-out), scale 120ms var(--ease-out, ease-out);
}
.offering-popover[data-starting-style],
.offering-popover[data-ending-style] {
  opacity: 0;
  scale: 0.97;
}
@media (prefers-reduced-motion: reduce) {
  .offering-popover { transition: opacity 80ms linear; scale: none; }
}
```

- [ ] **Step 4: Update the page's mount and typecheck**

In `schedule-page-container.tsx`, change the import and mount to `OfferingPopoverContainer`. The page still sets `scheduleDialogAtom` until Task 5. The popover will simply never open in between. That is acceptable for this intermediate commit because Task 5 wires the triggers.

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run src/components/admin/schedule`
Expected: all clean. All schedule tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/admin/schedule src/styles.css
git commit -m "feat(schedule): offering popover shell — virtual anchor, inert preview, discard on dirty dismiss"
```

---

### Task 5: Wire hover, click, keyboard, touch and drop

**Files:**
- Modify: `src/components/admin/schedule/offering-segment.tsx`
- Modify: `src/components/admin/schedule/schedule-day-container.tsx`
- Modify: `src/components/admin/schedule/schedule-page-container.tsx`
- Modify: `src/atoms/schedule.ts` (delete the TEMPORARY `scheduleDialogAtom`)
- Test: `src/components/admin/schedule/__tests__/offering-segment.test.tsx`

**Interfaces:**
- Consumes: `createHoverIntent` and `anchorFromPointerEvent` (Task 2). The atoms (Tasks 1–2). `offeringPopoverFirstField` (Task 4).
- Produces: `OfferingSegment` replaces `onClick: () => void` with:
  ```ts
  onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLButtonElement>) => void;
  onBlur: () => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  ```
  `ScheduleDayContainer` replaces `onOpenOffering` with a single `segmentHandlers: (offeringId: number) => SegmentHandlers`. Export `type SegmentHandlers = Pick<OfferingSegmentProps, 'onPointerEnter' | 'onPointerMove' | 'onPointerLeave' | 'onFocus' | 'onBlur' | 'onClick'>` from `offering-segment.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/admin/schedule/__tests__/offering-segment.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferingSegment } from '../offering-segment';

const handlers = () => ({
  onPointerEnter: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerLeave: vi.fn(),
  onFocus: vi.fn(),
  onBlur: vi.fn(),
  onClick: vi.fn(),
});

describe('OfferingSegment', () => {
  it('forwards hover, focus and click to its handlers with the segment as target', () => {
    const h = handlers();
    render(
      <OfferingSegment
        label="X"
        tone=""
        isStart
        isEnd={false}
        isContinuation={false}
        headcount={2}
        accessibleName="X, 2 people. Edit this offering."
        {...h}
      />,
    );
    const button = screen.getByRole('button', { name: /Edit this offering/ });
    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 5, clientY: 6 });
    fireEvent.pointerMove(button, { pointerType: 'mouse' });
    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    fireEvent.focus(button);
    fireEvent.blur(button);
    fireEvent.click(button);
    expect(h.onPointerEnter.mock.calls[0][0].currentTarget).toBe(button);
    expect(h.onPointerMove).toHaveBeenCalledTimes(1);
    expect(h.onPointerLeave).toHaveBeenCalledTimes(1);
    expect(h.onFocus).toHaveBeenCalledTimes(1);
    expect(h.onBlur).toHaveBeenCalledTimes(1);
    expect(h.onClick).toHaveBeenCalledTimes(1);
  });
});
```

Note: `currentTarget` is reset after dispatch in React 17+. If the first assertion reads `null`, change it to assert `mock.calls[0][0].target` is `button`. The container reads `event.currentTarget` synchronously inside the handler, where it is valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/admin/schedule/__tests__/offering-segment.test.tsx`
Expected: FAIL. `onPointerEnter` is never called because the segment does not attach it yet.

- [ ] **Step 3: Implement**

`offering-segment.tsx`: extract the props object type to `export type OfferingSegmentProps = {…}`. Replace `onClick: () => void` with the six handler props from Interfaces. Attach them to the `<button>` (`onPointerEnter={onPointerEnter}` etc.). Export `SegmentHandlers`. Update the `accessibleName` doc: the name still ends "Edit this offering." Hover preview is an enhancement, and the click/Enter action is unchanged.

`schedule-day-container.tsx`: change the prop to `segmentHandlers: (offeringId: number) => SegmentHandlers`, and on each segment `{...segmentHandlers(offering.id)}` (remove `onClick`).

`schedule-page-container.tsx`:

```tsx
import { useRef } from 'react';
import {
  dispatchOfferingPopoverAtom,
  offeringPopoverAnchorAtom,
  offeringPopoverAtom,
} from '#/atoms/schedule';
import { createHoverIntent, type HoverIntent } from './hover-intent';
import { anchorFromPointerEvent } from './popover-anchor';
import { offeringPopoverFirstField, OfferingPopoverContainer } from './offering-popover-container';
import type { SegmentHandlers } from './offering-segment';
import type { PopoverTarget } from './offering-popover-state';
```

Inside the component (replace `const setDialog = useSetAtom(scheduleDialogAtom);`):

```tsx
const popover = useAtomValue(offeringPopoverAtom);
const dispatch = useSetAtom(dispatchOfferingPopoverAtom);
const setAnchor = useSetAtom(offeringPopoverAnchorAtom);

// Read inside timer callbacks, which outlive the render that created them —
// a ref, not the render's `popover`, or the callback would act on stale state.
const popoverRef = useRef(popover);
popoverRef.current = popover;
// The latest cursor anchor per hovered segment, so the delayed open lands
// where the pointer IS after 300 ms, not where it entered.
const pendingAnchor = useRef<ReturnType<typeof anchorFromPointerEvent> | null>(null);
const moveFrame = useRef<number | null>(null);

const hoverRef = useRef<HoverIntent | null>(null);
hoverRef.current ??= createHoverIntent({
  onOpen: (offeringId) => {
    if (popoverRef.current.status === 'pinned') return;
    if (pendingAnchor.current) setAnchor(pendingAnchor.current);
    dispatch({ type: 'preview', offeringId });
  },
  onClose: (offeringId) => dispatch({ type: 'leave', offeringId }),
});
const hover = hoverRef.current;

/** Pin, then put focus in the popover — Base UI's initialFocus only runs on open. */
const pin = (target: PopoverTarget, anchor: Parameters<typeof setAnchor>[0]) => {
  hover.cancel();
  // Pinning while another offering is pinned is refused by the reducer (it
  // is asking about unsaved edits); do not move the anchor out from under it.
  if (popoverRef.current.status === 'pinned') return;
  setAnchor(anchor);
  dispatch({ type: 'pin', target });
  requestAnimationFrame(() => offeringPopoverFirstField.current?.focus());
};

const segmentHandlers = (offeringId: number): SegmentHandlers => ({
  onPointerEnter: (event) => {
    if (event.pointerType !== 'mouse') return;
    pendingAnchor.current = anchorFromPointerEvent(event.currentTarget, event);
    // Moving onto another offering while one previews switches at once —
    // the anchor must move with it.
    if (popoverRef.current.status === 'preview') setAnchor(pendingAnchor.current);
    hover.enter(offeringId, event.pointerType, popoverRef.current.status === 'preview');
  },
  onPointerMove: (event) => {
    if (event.pointerType !== 'mouse') return;
    pendingAnchor.current = anchorFromPointerEvent(event.currentTarget, event);
    const state = popoverRef.current;
    if (state.status !== 'preview' || state.offeringId !== offeringId) return;
    // One anchor write per frame: pointermove can fire faster than paint.
    if (moveFrame.current !== null) return;
    moveFrame.current = requestAnimationFrame(() => {
      moveFrame.current = null;
      if (pendingAnchor.current) setAnchor(pendingAnchor.current);
    });
  },
  onPointerLeave: (event) => hover.leave(offeringId, event.pointerType),
  onFocus: (event) => {
    // Keyboard only: a mouse click also focuses the button, and that path is
    // handled by hover + click. `:focus-visible` is the browser's own
    // "this came from the keyboard" signal.
    if (!event.currentTarget.matches(':focus-visible')) return;
    if (popoverRef.current.status === 'pinned') return;
    setAnchor({ kind: 'element', element: event.currentTarget });
    dispatch({ type: 'preview', offeringId });
  },
  onBlur: () => {
    // Leaving the bar by keyboard closes its preview. If focus moved INTO the
    // popover the state is pinned by then and `leave` is a no-op.
    const state = popoverRef.current;
    if (state.status === 'preview' && state.offeringId === offeringId)
      dispatch({ type: 'leave', offeringId });
  },
  onClick: (event) =>
    pin({ mode: 'edit', offeringId }, anchorFromPointerEvent(event.currentTarget, event)),
});
```

Note for the implementer: `onBlur` fires on the segment *before* `onClick` only when focus leaves, and a click on the segment keeps focus on it. So there is no blur-then-click race for a mouse pin.

In `onDragEnd`, replace `setDialog({ mode: 'create', … })` with:

```tsx
// The day dropped on, captured once: a fixed rect is enough — the popover
// pins immediately and is about to take focus, not follow anything.
const r = event.over.rect;
pin(
  { mode: 'create', courseId, courseName: course.name, startsOn: dayKey },
  { kind: 'rect', left: r.left, top: r.top, width: r.width, height: r.height },
);
```

(`event.over` is non-null here because `dayKey` was non-null. Narrow it with `if (!event.over) return;` above.)

Pass `segmentHandlers={segmentHandlers}` to `ScheduleDayContainer` instead of `onOpenOffering`. Update the DnD `onDragEnd` announcement: `Dropped on ${…}. Set the end date to finish scheduling.` stays correct.

Delete the TEMPORARY `ScheduleDialogState`/`scheduleDialogAtom` from `src/atoms/schedule.ts`. Run `grep -rn "scheduleDialogAtom\|ScheduleDialogState\|OfferingDialogContainer" src`. Expected: no matches.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `pnpm vitest run src/components/admin/schedule && pnpm tsc --noEmit && pnpm lint`
Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/admin/schedule src/atoms/schedule.ts
git commit -m "feat(schedule): hover previews an offering and follows the mouse; click, Enter, tap or drop pins it"
```

---

### Task 6: Verify in the real app

**Files:** none (unless defects are found; fix them in the owning file and commit with `fix(schedule): …`).

- [ ] **Step 1: Run the app**

Run: `pnpm dev` (port **5001**, not 5000). Sign in as an admin and open the Schedule tab. Make sure at least one offering has **12+ people**. If none does, add people through the popover itself; that exercises Add too.

- [ ] **Step 2: Walk the checklist (mouse)**

Use the claude-in-chrome tools and record `schedule-offering-popover.gif`.

1. Rest on a bar for under 300 ms, then move off. No popup.
2. Rest on a bar for more than 300 ms. The preview appears to the right of the cursor and follows it smoothly along the bar. There is no blink at day boundaries.
3. Move to a neighbouring offering's bar. The preview switches immediately.
4. Near the right screen edge, the preview flips to the cursor's left. Near the bottom, it shifts up. It never leaves the viewport.
5. Click the bar. The popup stops following, focus lands in **Start date**, and the fields are editable. Hovering other bars does nothing.
6. 12+ people: exactly 10 rows are visible, the table scrolls, and the header sticks. The popup is no taller than form + 10 rows + padding.
7. Edit the window and press Esc. The discard confirm appears with focus on **Keep editing**. Keep editing → the edit is still there. Click outside → confirm → **Discard changes** → closed. Re-hovering shows the saved values.
8. Clean popover, click outside → closes. Cancel/Save/Unschedule each close it.
9. Dirty popover, click a *different* bar → the confirm shows and the other offering does **not** open.
10. Drag a course onto a day. The popover opens pinned beside that day, with focus in Start date.

- [ ] **Step 3: Keyboard, touch, theme, short viewport**

11. Tab to a bar. The preview appears beside the segment. Enter pins it and focus moves in. Esc (clean) closes it and focus returns to the bar.
12. Use `resize_window` / DevTools touch emulation and tap a bar. It pins straight away with no preview first.
13. Repeat check 6 in dark mode.
14. Resize the window to 700 px tall. The pinned popup scrolls inside itself and never exceeds the viewport.
15. Run a contrast spot-check on the new explainer text (`text-secondary text-xs`) and the discard bar text (`text-error-text` on `bg-error-3`). Both must be ≥ 4.5:1 in light and dark. Per the semantic-token memory these are AAA tokens, but measure in the browser anyway.

- [ ] **Step 4: Full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint && pnpm build`
Expected: all green. Also run `grep -c drizzle .output/public/assets/*.js` (or the build's client asset dir); expect 0. This guards against server code leaking into the client bundle after the file moves.

- [ ] **Step 5: Report**

Send the GIF to the user with `SendUserFile`. List each checklist item as passed, or as failed with what was seen.
