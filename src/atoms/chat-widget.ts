import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/** Whether the chat widget window is open. Not persisted — always starts
 * closed on load. */
export const chatWidgetOpenAtom = atom(false);

/** Font size (px) of chat message body text. Persisted so the user's
 * preferred reading size stays across reloads. Toggled between 18 and 16. */
export const chatWidgetFontSizeAtom = atomWithStorage<number>(
  'chat-widget-font-size',
  16,
);

/** Rect (px, fixed-viewport coords) of the chat window: its position and size
 * as one unit. `null` means "use the computed default" (bottom-right anchor at
 * default size). Persisted so a moved/resized window stays put across reloads;
 * reset clears it back to null. */
export interface ChatWindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const chatWidgetRectAtom = atomWithStorage<ChatWindowRect | null>(
  'chat-widget-rect',
  null,
  undefined,
  { getOnInit: true },
);

/**
 * Which conversation the shared chat window is driving. Onboarding reuses the
 * widget rather than getting its own surface, so the container needs to know
 * which data layer to feed the window — the window and every component below
 * it are mode-agnostic and take props.
 */
export type ChatWidgetMode =
  | { kind: 'viper7' }
  | { kind: 'onboarding'; courseSlug: string };

/** Not persisted — same reasoning as `chatWidgetOpenAtom`: a stale
 * `onboarding` mode pointing at a course the user has since finished (or
 * never returned to) would open the widget into a dead conversation on a
 * later, unrelated visit. */
export const chatWidgetModeAtom = atom<ChatWidgetMode>({ kind: 'viper7' });

/** Whether the learner dismissed ("Not now") the course page's onboarding
 * prompt for the currently-viewed course. Not persisted, same reasoning as
 * `chatWidgetOpenAtom` and `chatWidgetModeAtom` — it's a per-visit UI
 * decision, not a durable preference, and only one course page is ever on
 * screen at a time so a single module-scoped atom (not keyed per-course) is
 * sufficient. */
export const onboardingPromptDismissedAtom = atom(false);
