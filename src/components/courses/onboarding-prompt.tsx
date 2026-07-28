import { Button } from '@base-ui/react/button';
import { cn } from '#/lib/cn';

export interface OnboardingPromptProps {
  /** Starts (or resumes) the onboarding interview in the shared chat widget. */
  onStart: () => void;
  /**
   * Dismisses the prompt for this visit. Client-side UI state only — this
   * must NOT call the onboarding delete endpoint (`useOnboardingChat`'s
   * `deleteSession`), which permanently withdraws everything the learner has
   * already shared. "Not now" just hides the offer; it is not a refusal.
   */
  onDismiss: () => void;
}

/**
 * Presentational: offers to start the course-onboarding interview from the
 * course landing page. Pure props in, "Start" / "Not now" actions out — no
 * internal state, no data fetching. Built on the base UI `Button` (no custom
 * button markup) per this repo's base-component-first rule.
 */
export function OnboardingPrompt({
  onStart,
  onDismiss,
}: OnboardingPromptProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-gray-6 bg-gray-2 p-5',
        'sm:flex-row sm:items-center sm:justify-between sm:gap-4',
      )}
    >
      <p className="text-start text-sm text-primary">
        Want a quick conversation to personalize this course before you start?
      </p>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-gray-4 hover:text-primary"
        >
          Not now
        </Button>
        <Button
          type="button"
          onClick={onStart}
          className="rounded-lg bg-accent-9 px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-10"
        >
          Start
        </Button>
      </div>
    </div>
  );
}
