// @vitest-environment jsdom
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardLesson, BoardModule } from '#/lib/admin-schemas';

/**
 * Every tooltip in the app must close the moment the pointer leaves its
 * trigger. Two of the five are exercised here — the shared icon button and the
 * quickshot chips that were reported. `ClampedText` and the two dialog
 * triggers hold refs or dialog state, so they cannot be rendered under
 * react-compiler + Vitest (the dispatcher is null); their `Tooltip.Root` calls
 * carry the same prop and the same comment.
 *
 * Base UI's default is the opposite: `TooltipTrigger` wires
 * `handleClose: !disableHoverablePopup ? safePolygon() : null`, a floating-ui
 * grace area that keeps the popup alive while the pointer travels toward it
 * and indefinitely once it is over it. Measured in the browser against the
 * shipped build: with the pointer off the chip and resting where the popup had
 * appeared, the tooltip was still `data-open` half a second later; with
 * `disableHoverablePopup` it was closed.
 *
 * That behaviour lives entirely inside Base UI, so what is testable here — and
 * what actually regresses — is the WIRING: a tooltip added later without the
 * prop, or the prop dropped from one that has it. So the Base UI module is
 * stubbed and each component is asked what it passed to `Tooltip.Root`.
 */
const roots = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock('@base-ui/react/tooltip', () => {
  const passthrough =
    (testid: string) =>
    ({ children }: { children?: ReactNode }) => (
      <div data-testid={testid}>{children}</div>
    );
  return {
    Tooltip: {
      Provider: passthrough('provider'),
      Root: ({ children, ...props }: { children?: ReactNode }) => {
        roots.props.push(props);
        return <div data-testid="root">{children}</div>;
      },
      Trigger: ({ children }: { children?: ReactNode }) => (
        <button type="button">{children}</button>
      ),
      Portal: passthrough('portal'),
      Positioner: passthrough('positioner'),
      Popup: passthrough('popup'),
    },
  };
});

import { LessonQuickshot } from '../admin/lesson-quickshot';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

beforeEach(() => {
  roots.props = [];
});

const lesson = (): BoardLesson =>
  ({
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
  }) as BoardLesson;

const module_ = (): BoardModule =>
  ({
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
    learnerCount: 0,
    owner: { id: 10, name: 'Emergencies' },
    otherCourseCount: 0,
  }) as BoardModule;

describe('tooltips close when the pointer leaves', () => {
  it('the shared icon button asks for it', () => {
    render(<TooltipIconButton label="Delete">x</TooltipIconButton>);

    expect(roots.props).toHaveLength(1);
    expect(roots.props[0].disableHoverablePopup).toBe(true);
  });

  /**
   * The chips in the screenshot this was reported from. Every one of them —
   * four toggles plus the level chip — sits in a dense list whose popup
   * overlaps the row above, which is where a tooltip that outlives the pointer
   * is most obviously wrong.
   *
   * Mutant seen RED: the prop added to `TooltipIconButton` alone, which is the
   * tempting one-line fix and leaves the chips that were actually reported
   * behaving exactly as before.
   */
  it('every quickshot chip asks for it', () => {
    render(
      <LessonQuickshot
        lesson={lesson()}
        module={module_()}
        onPatch={vi.fn()}
      />,
    );

    expect(roots.props.length).toBeGreaterThan(0);
    for (const props of roots.props) {
      expect(props.disableHoverablePopup).toBe(true);
    }
  });
});
