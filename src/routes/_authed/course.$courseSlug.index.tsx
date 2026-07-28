import { createFileRoute } from '@tanstack/react-router';
import { useAtom, useSetAtom } from 'jotai';
import {
  chatWidgetModeAtom,
  chatWidgetOpenAtom,
  onboardingPromptDismissedAtom,
} from '#/atoms/chat-widget';
import { OnboardingPrompt } from '#/components/courses/onboarding-prompt';
import { useOnboardingChat } from '#/data-hooks/use-onboarding-chat';
import { LessonEmpty } from '../../components/lesson-main';

/**
 * Container: offers to start the course-onboarding interview above the
 * lesson-picker empty state.
 *
 * No existing hook/loader exposes the onboarding row for this course, so
 * this reads `useOnboardingChat(courseSlug)`'s own status instead of adding
 * one: `status === 'awaiting_consent'` with no prior user turn means the
 * consent gate hasn't been engaged with yet. This is deliberately narrower
 * than `shouldOfferOnboarding` (`src/lib/course-onboarding.ts`), which also
 * covers resuming a mid-interview session — the prompt's copy here
 * ("Start" / "Not now") only reads correctly for the not-yet-started case,
 * so a resume-mid-interview affordance is intentionally out of scope.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  component: CourseIndexContainer,
});

function CourseIndexContainer() {
  const { courseSlug } = Route.useParams();
  const { messages, status } = useOnboardingChat(courseSlug);
  const [dismissed, setDismissed] = useAtom(onboardingPromptDismissedAtom);
  const setMode = useSetAtom(chatWidgetModeAtom);
  const setOpen = useSetAtom(chatWidgetOpenAtom);

  const shouldOffer =
    !dismissed &&
    status === 'awaiting_consent' &&
    messages.every((message) => message.role !== 'user');

  const onStart = () => {
    setMode({ kind: 'onboarding', courseSlug });
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {shouldOffer && (
        <OnboardingPrompt
          onStart={onStart}
          onDismiss={() => setDismissed(true)}
        />
      )}
      <LessonEmpty />
    </div>
  );
}
