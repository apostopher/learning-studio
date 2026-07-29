import { describe, expect, it } from 'vitest';
import type { ChatWidgetMode } from '#/atoms/chat-widget';
import { shouldAutoOpenOnboarding } from '#/lib/onboarding-auto-open';
import type { OnboardingProgress } from '#/lib/onboarding-session.server';

const ONBOARDING_MODE: ChatWidgetMode = {
  kind: 'onboarding',
  courseSlug: 'ppl',
};
const VIPER7_MODE: ChatWidgetMode = { kind: 'viper7' };

describe('shouldAutoOpenOnboarding', () => {
  it('opens when not_started and the widget is closed', () => {
    expect(
      shouldAutoOpenOnboarding({
        status: 'not_started',
        isWidgetOpen: false,
        widgetMode: VIPER7_MODE,
      }),
    ).toBe(true);
  });

  it('opens when not_started and the widget is already open in onboarding mode', () => {
    // Re-affirming an already-open onboarding session is harmless.
    expect(
      shouldAutoOpenOnboarding({
        status: 'not_started',
        isWidgetOpen: true,
        widgetMode: ONBOARDING_MODE,
      }),
    ).toBe(true);
  });

  it('refuses when not_started but the widget is open on a Viper7 conversation', () => {
    // The hijack guard: never swap the window out from under an active
    // Viper7 conversation.
    expect(
      shouldAutoOpenOnboarding({
        status: 'not_started',
        isWidgetOpen: true,
        widgetMode: VIPER7_MODE,
      }),
    ).toBe(false);
  });

  const otherStatuses: (OnboardingProgress | undefined)[] = [
    'in_progress',
    'complete',
    'declined',
    'deleted',
    undefined,
  ];

  it.each(
    otherStatuses,
  )('refuses for status %s even when the widget is closed', (status) => {
    expect(
      shouldAutoOpenOnboarding({
        status,
        isWidgetOpen: false,
        widgetMode: VIPER7_MODE,
      }),
    ).toBe(false);
  });
});
