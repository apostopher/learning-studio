import { ExternalLink } from 'lucide-react';

type LinksProps = {
  links: string[] | null;
};

export const Links = ({ links }: LinksProps) => {
  if (!links || links.length === 0) {
    return (
      <p className="text-sm text-secondary">
        No links available for this lesson yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {links.map((href) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-accent-text transition-colors hover:bg-gray-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-8"
          >
            <ExternalLink
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="break-all underline underline-offset-2 decoration-accent-7 group-hover:decoration-accent-9">
              {href}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
};
