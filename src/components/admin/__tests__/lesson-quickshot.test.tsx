// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonQuickshot } from '#/components/admin/lesson-quickshot';
import type { BoardLesson } from '#/lib/admin-schemas';

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
    version: '1.0',
    disciplineVersion: '1.0',
    contentUpdatedAt: new Date(0),
    dependsOn: [],
    videoProvider: null,
    videoRef: null,
    ...overrides,
  };
}

function renderQuickshot(lessonOverrides: Partial<BoardLesson> = {}) {
  const onPatch = vi.fn();
  render(
    <LessonQuickshot lesson={lesson(lessonOverrides)} onPatch={onPatch} />,
  );
  return onPatch;
}

describe('LessonQuickshot toggles', () => {
  // Levels are set per discipline, on the library's Update levels board —
  // never from a course's lesson card.
  it('offers no level control, even on a lesson that has levels', () => {
    renderQuickshot({ levels: ['basic', 'advanced'] });
    expect(screen.queryByRole('button', { name: /level/i })).toBeNull();
    expect(screen.queryByRole('group', { name: /level/i })).toBeNull();
  });

  // Paid/free moved to the padlock on the card itself.
  it('offers no paid/free chip', () => {
    renderQuickshot();
    expect(
      screen.queryByRole('button', { name: /make it (paid|free)/ }),
    ).toBeNull();
  });

  it('makes a debrief required and sends only that field', async () => {
    const user = userEvent.setup();
    const onPatch = renderQuickshot();

    await user.click(screen.getByRole('button', { name: /Debrief optional/ }));

    expect(onPatch).toHaveBeenCalledWith({ hasDebrief: true });
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
  it('does not claim a required debrief hides the quiz — both tabs show', () => {
    renderQuickshot({ hasDebrief: true, quizQuestionCount: 7 });

    expect(
      screen.getByRole('button', { name: /Debrief required/ }),
    ).toBeDefined();
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
        .getByRole('button', { name: /Debrief required/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: /Watch optional/ })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
