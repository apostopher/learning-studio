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
  const resumableStatuses: OnboardingProgress[] = [
    'not_started',
    'in_progress',
  ];

  it.each(
    resumableStatuses,
  )('opens when %s and the widget is closed', (status) => {
    expect(
      shouldAutoOpenOnboarding({
        status,
        isWidgetOpen: false,
        widgetMode: VIPER7_MODE,
      }),
    ).toBe(true);
  });

  it.each(
    resumableStatuses,
  )('opens when %s and the widget is already open in onboarding mode', (status) => {
    // Re-affirming an already-open onboarding session is harmless.
    expect(
      shouldAutoOpenOnboarding({
        status,
        isWidgetOpen: true,
        widgetMode: ONBOARDING_MODE,
      }),
    ).toBe(true);
  });

  it.each(
    resumableStatuses,
  )('refuses when %s but the widget is open on a Viper7 conversation', (status) => {
    // The hijack guard: never swap the window out from under an active
    // Viper7 conversation.
    expect(
      shouldAutoOpenOnboarding({
        status,
        isWidgetOpen: true,
        widgetMode: VIPER7_MODE,
      }),
    ).toBe(false);
  });

  const closedStatuses: (OnboardingProgress | undefined)[] = [
    'complete',
    'declined',
    'deleted',
    undefined,
  ];

  it.each(
    closedStatuses,
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
