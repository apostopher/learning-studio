import { ExternalLink } from 'lucide-react';
import type { MaterialLink } from '#/types';

type LinksProps = {
  links: MaterialLink[] | null;
};

export const Links = ({ links }: LinksProps) => {
  const usable = links?.filter((link) => link.url.trim().length > 0) ?? [];

  if (usable.length === 0) {
    return (
      <p className="text-sm text-secondary">
        No links available for this lesson yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {usable.map((link) => {
        const name = link.name.trim();
        return (
          <li key={`${name}|${link.url}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-accent-text transition-colors hover:bg-gray-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-8"
            >
              <ExternalLink
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words underline underline-offset-2 decoration-accent-7 group-hover:decoration-accent-9">
                  {name || link.url}
                </span>
                {name && (
                  <span className="break-all text-tertiary text-xs">
                    {link.url}
                  </span>
                )}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
};
