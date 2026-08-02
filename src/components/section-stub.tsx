import { Construction } from 'lucide-react';

type SectionStubProps = {
  title: string;
  /** What this section will do, in one line. */
  description: string;
};

/**
 * A placeholder for a nav destination that exists but has no page yet.
 *
 * Deliberately explicit rather than an empty page or a permanent spinner: a
 * learner who clicks Settings and gets a blank screen concludes the app is
 * broken, and a spinner that never resolves is worse. This says what the
 * section is for and that it is not ready, which is the truth.
 *
 * Shares LibraryPage's shell so the three stubs and the one real page do not
 * drift apart before the others are built.
 */
export const SectionStub = ({ title, description }: SectionStubProps) => (
  <div className="content-grid py-8">
    <div className="content flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold text-primary">{title}</h1>
      </header>
      <div className="flex flex-col items-center gap-3 rounded-element border border-dashed border-border bg-muted px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-gray-a3 text-secondary">
          <Construction className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-primary">
          {title} is coming soon
        </p>
        <p className="max-w-prose text-sm text-secondary">{description}</p>
      </div>
    </div>
  </div>
);
