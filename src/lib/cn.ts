import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * This project's font sizes are theme tokens (`--text-h6`, `--text-body`, …)
 * rather than Tailwind's stock scale, and tailwind-merge cannot know that.
 * Faced with an unrecognised `text-*`, it files the class under text-*colour*
 * — so any later colour silently deletes the size:
 *
 *   cn('font-mono text-h6', 'text-tertiary')  // → 'font-mono text-tertiary'
 *
 * That is how the board's chips came to render at their inherited 14px instead
 * of the 10px `text-h6` asks for: nothing errored, the class simply vanished.
 * Registering the tokens in the `font-size` group puts each back in the group
 * it belongs to, so a size and a colour stop competing.
 *
 * Keep this list in step with the `--text-*` tokens in `src/styles/tokens.css`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-1',
            'display-2',
            'display-3',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'large',
            'body',
            'label',
            'code',
            'supporting',
          ],
        },
      ],
    },
  },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
