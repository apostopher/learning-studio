import { describe, expect, it } from 'vitest';
import {
  createsCycle,
  cyclicPrerequisites,
  type DepLesson,
  type DepModule,
  moduleGateWarning,
} from '#/lib/module-dependency-graph';

const lesson = (over: Partial<DepLesson> = {}): DepLesson => ({
  isAvailable: true,
  needsVideoWatch: true,
  hasVideo: true,
  ...over,
});

const mod = (
  slug: string,
  dependsOn: string[] = [],
  lessons: DepLesson[] = [lesson()],
): DepModule => ({ slug, name: slug.toUpperCase(), dependsOn, lessons });

describe('cyclicPrerequisites', () => {
  it('always excludes the module itself', () => {
    // A module that requires itself waits on lessons it gates — a deadlock
    // with exactly the same shape as a two-node cycle.
    const modules = [mod('a'), mod('b')];
    expect(cyclicPrerequisites(modules, 'a')).toEqual(new Set(['a']));
  });

  it('excludes a module that directly requires this one', () => {
    // b requires a, so a requiring b closes the loop.
    const modules = [mod('a'), mod('b', ['a'])];
    expect(cyclicPrerequisites(modules, 'a')).toEqual(new Set(['a', 'b']));
  });

  it('excludes a module that transitively requires this one', () => {
    // c -> b -> a. Making c a prerequisite of a closes a three-node loop.
    const modules = [mod('a'), mod('b', ['a']), mod('c', ['b'])];
    expect(cyclicPrerequisites(modules, 'a')).toEqual(new Set(['a', 'b', 'c']));
  });

  it('permits a module on an unrelated branch', () => {
    // d sits in its own chain; nothing about d reaches a.
    const modules = [mod('a'), mod('b', ['a']), mod('d'), mod('e', ['d'])];
    const cyclic = cyclicPrerequisites(modules, 'a');
    expect(cyclic.has('d')).toBe(false);
    expect(cyclic.has('e')).toBe(false);
  });

  it('permits a shared prerequisite (diamond, not a loop)', () => {
    // b and c both require a; d may require both without forming a cycle.
    const modules = [mod('a'), mod('b', ['a']), mod('c', ['a']), mod('d')];
    expect(cyclicPrerequisites(modules, 'd')).toEqual(new Set(['d']));
  });

  it('ignores the module its own outgoing edges, which are being replaced', () => {
    // a already requires b. Asking what a may require must not treat a's own
    // current edge as a reason to exclude b — replacing it is the whole point.
    const modules = [mod('a', ['b']), mod('b')];
    expect(cyclicPrerequisites(modules, 'a')).toEqual(new Set(['a']));
  });

  it('terminates on a cycle already present in the data', () => {
    // Rows written before this validation existed can already be cyclic; the
    // traversal must not hang on them.
    const modules = [mod('a', ['b']), mod('b', ['a'])];
    expect(() => cyclicPrerequisites(modules, 'a')).not.toThrow();
  });

  it('ignores dangling slugs that match no module', () => {
    const modules = [mod('a', ['ghost']), mod('b', ['a'])];
    expect(cyclicPrerequisites(modules, 'a')).toEqual(new Set(['a', 'b']));
  });
});

describe('createsCycle', () => {
  it('rejects a proposed edge that closes a loop', () => {
    const modules = [mod('a'), mod('b', ['a'])];
    expect(createsCycle(modules, 'a', ['b'])).toBe(true);
  });

  it('rejects self-dependency', () => {
    expect(createsCycle([mod('a')], 'a', ['a'])).toBe(true);
  });

  it('accepts an edge on an unrelated branch', () => {
    const modules = [mod('a'), mod('b', ['a']), mod('d')];
    expect(createsCycle(modules, 'a', ['d'])).toBe(false);
  });

  it('accepts clearing every prerequisite', () => {
    const modules = [mod('a', ['b']), mod('b')];
    expect(createsCycle(modules, 'a', [])).toBe(false);
  });

  it('rejects when only one of several proposed edges is cyclic', () => {
    // The safe edge must not mask the unsafe one.
    const modules = [mod('a'), mod('b', ['a']), mod('d')];
    expect(createsCycle(modules, 'a', ['d', 'b'])).toBe(true);
  });

  it('accepts a proposal for a module absent from the list', () => {
    // A module id that resolves to no row is the route handler's 404 to
    // report, not this predicate's error.
    expect(createsCycle([mod('a')], 'gone', ['a'])).toBe(false);
  });
});

describe('moduleGateWarning', () => {
  it('is silent when a lesson can actually block', () => {
    expect(moduleGateWarning(mod('a'))).toBeNull();
  });

  it('reports a module with no lessons', () => {
    const warning = moduleGateWarning(mod('a', [], []));
    expect(warning).toContain('no lessons yet');
  });

  it('reports a module whose lessons all skip the video watch', () => {
    const warning = moduleGateWarning(
      mod('a', [], [lesson({ needsVideoWatch: false })]),
    );
    expect(warning).toContain('can never block');
  });

  it('reports a module whose lessons have no video', () => {
    // A lesson with no video assigned at all is the common case — gating
    // (`isLessonSatisfied`) returns true for every such lesson, so the
    // prerequisite silently does nothing.
    const warning = moduleGateWarning(
      mod('a', [], [lesson({ hasVideo: false })]),
    );
    expect(warning).toContain('can never block');
  });

  it('reports a module whose only blocking lesson is unavailable', () => {
    // Gating filters unavailable lessons out before checking satisfaction.
    const warning = moduleGateWarning(
      mod('a', [], [lesson({ isAvailable: false })]),
    );
    expect(warning).toContain('can never block');
  });

  it('is silent when one of several lessons can block', () => {
    const warning = moduleGateWarning(
      mod('a', [], [lesson({ needsVideoWatch: false }), lesson()]),
    );
    expect(warning).toBeNull();
  });

  it('names the module so the row says which prerequisite is inert', () => {
    expect(moduleGateWarning({ ...mod('a', [], []), name: 'Airspace' })).toBe(
      'Airspace has no lessons yet, so this prerequisite won’t lock anything until it does.',
    );
  });
});
