import type { ChatWidgetMode } from '#/atoms/chat-widget';
import type { OnboardingProgress } from '#/lib/onboarding-session.server';

/**
 * Whether the course page should auto-open the shared chat widget into
 * onboarding mode. `'not_started'` and `'in_progress'` both qualify — a
 * resumable session, whether never begun or merely interrupted, should be
 * reachable again. `'in_progress'` covers every interruption short of an
 * explicit decline/complete/delete: a timeout, an API error, or simply
 * closing the widget mid-conversation. Originally this only fired for
 * `'not_started'`, on the assumption that an in-progress session didn't need
 * an auto-open path — but with the manual "Start"/resume prompt removed,
 * that left an interrupted interview with no way back in at all (the row
 * correctly stayed `in_progress`, never `'complete'`/`'declined'`/`'deleted'`,
 * but nothing offered to resume it). `'complete'`/`'declined'`/`'deleted'`/
 * unknown/loading must still leave the widget alone.
 *
 * Also refuses to interrupt an actively open Viper7 conversation: auto-open
 * previously only ever happened via an explicit "Start" click, so silently
 * hijacking whatever the learner is doing with the widget right now — losing
 * an unsent draft, a mid-scroll position — is a failure mode this decision
 * must not introduce.
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
  if (status !== 'not_started' && status !== 'in_progress') return false;
  return !(isWidgetOpen && widgetMode.kind === 'viper7');
}
