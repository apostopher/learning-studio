// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  acceptsLessonDrag,
  acceptsModuleDrag,
  isAreaTarget,
} from '../dnd-targets';

/**
 * A whitelist that never OFFERS a target is indistinguishable, from the
 * user's side, from one that refuses it — both spring back. The difference is
 * that a refused drop carries a sentence and an announcement, and an
 * unoffered one is silent.
 *
 * That is not hypothetical: the module filter admitted only other modules, so
 * two of `resolveDrop`'s written refusals could never run, and the tests
 * asserting those sentences all passed.
 */
describe('acceptsModuleDrag', () => {
  it('offers the targets resolveDrop has a refusal for', () => {
    // Mutant this catches — and it is the exact bug that shipped:
    // `type === 'module'` alone. Dragging a module onto the library or onto
    // an empty course then produced `over === null`, and the drag sprang back
    // with no note, no toast and nothing announced.
    expect(acceptsModuleDrag('discipline')).toBe(true);
    expect(acceptsModuleDrag('course')).toBe(true);
  });

  it('still offers other modules, which is the only ALLOWED module drop', () => {
    expect(acceptsModuleDrag('module')).toBe(true);
  });

  it('offers nothing a module can never be dropped on', () => {
    // A module dropped on a lesson card or a module's inner container is not
    // a rule this pane enforces — it is not a target it presents.
    expect(acceptsModuleDrag('lesson')).toBe(false);
    expect(acceptsModuleDrag('container')).toBe(false);
    expect(acceptsModuleDrag('library-lesson')).toBe(false);
    expect(acceptsModuleDrag(undefined)).toBe(false);
  });
});

describe('acceptsLessonDrag', () => {
  it('offers modules, their slots, and the empty-course region', () => {
    expect(acceptsLessonDrag('container')).toBe(true);
    expect(acceptsLessonDrag('lesson')).toBe(true);
    // Without this an empty course is a dead zone: a lesson dropped there
    // cannot be placed (there is no module yet) and must SAY so.
    expect(acceptsLessonDrag('course')).toBe(true);
  });

  it('leaves discipline columns to the caller', () => {
    // The caller drops the column a library card came from — releasing a card
    // where it started is "never mind", and a red refusal would make the
    // universal cancel gesture look like an error. A blanket `true` here
    // would take that decision away from it.
    expect(acceptsLessonDrag('discipline')).toBe(false);
  });
});

describe('isAreaTarget', () => {
  it('is the regions a pointer sits inside, never the cards within them', () => {
    // Stage one of the collision pass. A module's droppable wraps its whole
    // item, so including `lesson` here would let it win `closestCorners`
    // against the smaller cards nested in it and every drop would append
    // instead of landing in the slot under the cursor.
    expect(isAreaTarget('container')).toBe(true);
    expect(isAreaTarget('discipline')).toBe(true);
    expect(isAreaTarget('course')).toBe(true);
    expect(isAreaTarget('lesson')).toBe(false);
    expect(isAreaTarget('module')).toBe(false);
  });
});
