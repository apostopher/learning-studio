import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

interface NewsStoryLinkProps {
  href: string;
  /** Announced as the link's name — the headline. */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * One story, as a single link.
 *
 * The whole card is the anchor rather than just the headline: it is the only
 * interactive thing in the card, so there is nothing to nest, and it makes the
 * tap target the card instead of a line of text.
 *
 * `rel="noopener noreferrer"` because every destination is a third-party page
 * we do not control. The visually-hidden suffix is how the new-tab behaviour
 * reaches a screen reader — a target change with no announcement is
 * disorienting when focus lands somewhere unexpected.
 */
export const NewsStoryLink = ({
  href,
  label,
  className,
  children,
}: NewsStoryLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${label} (opens in a new tab)`}
    className={cn(
      'group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 focus-visible:ring-offset-2',
      className,
    )}
  >
    {children}
  </a>
);
