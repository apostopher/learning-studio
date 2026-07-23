import { atomWithStorage } from 'jotai/utils';

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
