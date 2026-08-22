// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonQuickshot } from '#/components/admin/lesson-quickshot';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';

function lesson(overrides: Partial<BoardLesson> = {}): BoardLesson {
  return {
    id: 1,
    name: 'Radio failure',
    slug: 'radio-failure',
    rank: 1,
    isAvailable: true,
    hasDebrief: false,
    needsVideoWatch: false,
    requiredSubscriptions: [],
    levels: [],
    isConfigured: true,
    quizQuestionCount: 0,
    dependsOn: [],
    videoProvider: null,
    videoRef: null,
    ...overrides,
  };
}

function module_(overrides: Partial<BoardModule> = {}): BoardModule {
  return {
    id: 10,
    name: 'Emergencies',
    slug: 'emergencies',
    rank: 1,
    requiredSubscriptions: ['associate'],
    sequentialLessons: true,
    lessons: [],
    dependsOn: [],
    imageUrlAvif: null,
    imageUrlWebp: null,
    ...overrides,
  } as BoardModule;
}

function renderQuickshot(
  lessonOverrides: Partial<BoardLesson> = {},
  moduleOverrides: Partial<BoardModule> = {},
) {
  const onPatch = vi.fn();
  render(
    <LessonQuickshot
      lesson={lesson(lessonOverrides)}
      module={module_(moduleOverrides)}
      onPatch={onPatch}
    />,
  );
  return onPatch;
}

describe('LessonQuickshot toggles', () => {
  it('turns a debrief on and sends only that field', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot();

    await user.click(screen.getByRole('button', { name: /Debrief off/ }));

    expect(onPatch).toHaveBeenCalledWith({ hasDebrief: true });
  });

  it('copies the module’s subscriptions when a lesson is made paid', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot({}, { requiredSubscriptions: ['rpoc'] });

    await user.click(
      screen.getByRole('button', { name: /Tap to make it paid/ }),
    );

    expect(onPatch).toHaveBeenCalledWith({ requiredSubscriptions: ['rpoc'] });
  });

  it('clears subscriptions when a paid lesson is made free', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot({ requiredSubscriptions: ['associate'] });

    await user.click(
      screen.getByRole('button', { name: /Tap to make it free/ }),
    );

    expect(onPatch).toHaveBeenCalledWith({ requiredSubscriptions: [] });
  });
});

describe('LessonQuickshot access lock', () => {
  it('refuses to make a lesson paid inside a free module, and says why', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot({}, { requiredSubscriptions: [] });

    const chip = screen.getByRole('button', { name: /This module is free/ });
    expect(chip.getAttribute('aria-disabled')).toBe('true');

    await user.click(chip);
    // Without the lock this would write the module's empty array back and
    // appear to do nothing — worse than being unavailable.
    expect(onPatch).not.toHaveBeenCalled();
  });
});

describe('LessonQuickshot watch lock', () => {
  it('will not let a videoless lesson require a watch', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot({
      isConfigured: false,
      needsVideoWatch: false,
    });

    const chip = screen.getByRole('button', { name: /no video yet/ });
    expect(chip.getAttribute('aria-disabled')).toBe('true');

    await user.click(chip);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('lets a videoless lesson that already requires a watch turn it off', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot({
      isConfigured: false,
      needsVideoWatch: true,
    });

    // You may LEAVE an unsatisfiable state even though you may not enter one —
    // 20 imported lessons are in exactly this state.
    const chip = screen.getByRole('button', { name: /can never be satisfied/ });
    expect(chip.getAttribute('aria-disabled')).toBeNull();

    await user.click(chip);
    expect(onPatch).toHaveBeenCalledWith({ needsVideoWatch: false });
  });
});

describe('LessonQuickshot consequences', () => {
  it('warns, on the chip itself, that a debrief hides an authored quiz', () => {
    renderQuickshot({ hasDebrief: true, quizQuestionCount: 7 });

    expect(
      screen.getByRole('button', {
        name: /7 quiz questions are hidden from learners/,
      }),
    ).toBeDefined();
  });

  it('says nothing about a quiz when there is none to hide', () => {
    renderQuickshot({ hasDebrief: true, quizQuestionCount: 0 });

    expect(screen.getByRole('button', { name: /Debrief on/ })).toBeDefined();
    expect(
      screen.queryByRole('button', { name: /hidden from learners/ }),
    ).toBeNull();
  });
});

describe('LessonQuickshot state', () => {
  it('reports each toggle’s state so it is not carried by colour alone', () => {
    renderQuickshot({ hasDebrief: true, needsVideoWatch: false });

    expect(
      screen
        .getByRole('button', { name: /Debrief on/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: /Watch optional/ })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
