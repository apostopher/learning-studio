import { atom } from 'jotai';

/**
 * Whether the News page's sources disclosure is expanded.
 *
 * Collapsed by default: an expanded list of every source above the fold
 * competes with the lead story. Held here rather than in the component so the
 * empty state's "Show all sources" can open it, and so the picker stays a pure
 * presentational component.
 */
export const newsSourcesOpenAtom = atom(false);
