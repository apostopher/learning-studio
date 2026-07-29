import type { ChatWidgetMode } from '#/atoms/chat-widget';
import type { OnboardingProgress } from '#/lib/onboarding-session.server';

/**
 * Whether the course page should auto-open the shared chat widget into
 * onboarding mode. Only `'not_started'` ever qualifies — every other status
 * (already engaged, closed, or unknown/loading) must leave the widget alone.
 * Also refuses to interrupt an actively open Viper7 conversation: auto-open
 * previously only ever happened via an explicit "Start" click, so silently
 * hijacking whatever the learner is doing with the widget right now — losing
 * an unsent draft, a mid-scroll position — is a new failure mode this
 * decision must not introduce.
 */
export function shouldAutoOpenOnboarding({
  status,
  isWidgetOpen,
  widgetMode,
}: {
  status: OnboardingProgress | undefined;
  isWidgetOpen: boolean;
  widgetMode: ChatWidgetMode;
}): boolean {
  if (status !== 'not_started') return false;
  return !(isWidgetOpen && widgetMode.kind === 'viper7');
}
