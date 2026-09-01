// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// `CourseColumn` renders `ClampedText`, which measures with `useRef` —
// react-compiler nulls the hook dispatcher for this repo's components under
// vitest. Stubbed exactly as `course-column.test.tsx` does.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

import { CourseColumn } from '../course-column';
import { DisciplineColumn } from '../discipline-column';
import {
  COURSE_COLUMN_WIDTH_PX,
  COURSE_RAIL_MIN_WIDTH_PX,
  clampSplit,
  LIBRARY_COLUMN_WIDTH_PX,
  LIBRARY_MIN_WIDTH_PX,
  PANE_GUTTER_PX,
  SPLITTER_WIDTH_PX,
  splitBounds,
} from '../editor-split';

/** The library share, in px, that a bound resolves to on a row this wide. */
const libraryPx = (rowWidth: number, percent: number) =>
  (percent / 100) * rowWidth;

describe('splitBounds', () => {
  it('never lets the library fall below one whole discipline column', () => {
    const rowWidth = 1600;
    const { min } = splitBounds(rowWidth);

    // The point of the whole module: a percentage floor is a usable library on
    // a wide monitor and half a column on a laptop. Asserting in PIXELS is
    // what pins that — a mutant that went back to a flat 20% would pass any
    // assertion phrased as a percentage.
    expect(libraryPx(rowWidth, min)).toBeCloseTo(LIBRARY_MIN_WIDTH_PX, 6);
    expect(LIBRARY_MIN_WIDTH_PX).toBe(
      LIBRARY_COLUMN_WIDTH_PX + PANE_GUTTER_PX * 2,
    );
  });

  it('leaves the rail a whole course column, splitter included', () => {
    const rowWidth = 1600;
    const { max } = splitBounds(rowWidth);

    // Mutant this catches: forgetting the splitter's own 6px, which would let
    // the rail be squeezed 6px past its floor and clip the column's border.
    const railPx = rowWidth - SPLITTER_WIDTH_PX - libraryPx(rowWidth, max);
    expect(railPx).toBeCloseTo(COURSE_RAIL_MIN_WIDTH_PX, 6);
    expect(COURSE_RAIL_MIN_WIDTH_PX).toBe(
      COURSE_COLUMN_WIDTH_PX + PANE_GUTTER_PX * 2,
    );
  });

  it('floors both panes at the same width, because both columns are', () => {
    // REPLACES a test asserting the rail's floor was the LARGER of the two,
    // which held while the library used `w-80`. The two columns are now
    // deliberately the same size so the panes read as one system, which makes
    // that older property false — and makes "the constants got swapped" a
    // no-op rather than a bug worth catching.
    //
    // What is worth catching now: one column resized without the other.
    // Mutant this catches: `w-96` changed on one component alone, which the
    // two class-pinning tests below would report as a constant mismatch while
    // this one names the design rule that was broken.
    expect(LIBRARY_MIN_WIDTH_PX).toBe(COURSE_RAIL_MIN_WIDTH_PX);
  });

  it('freezes the handle when the row cannot fit both floors', () => {
    // 400px cannot hold a 352px library AND a 416px rail. Letting `min` simply
    // win would hand the library everything and clip the rail entirely.
    const { min, max } = splitBounds(400);

    expect(min).toBe(max);
    // Squeezed in proportion to what each side needs, so neither is starved.
    expect(min).toBeCloseTo(
      (LIBRARY_MIN_WIDTH_PX /
        (LIBRARY_MIN_WIDTH_PX + COURSE_RAIL_MIN_WIDTH_PX)) *
        100,
      6,
    );
  });

  it('is unconstrained before the row has been measured', () => {
    // Zero is what the atom holds for the frame before the ResizeObserver
    // reports. A bound computed from it would be Infinity; refusing to move
    // is a worse answer than moving freely for one frame.
    expect(splitBounds(0)).toEqual({ min: 0, max: 100 });
    expect(splitBounds(Number.NaN)).toEqual({ min: 0, max: 100 });
  });
});

describe('clampSplit', () => {
  it('holds a value inside the bounds from either side', () => {
    const bounds = { min: 25, max: 70 };
    expect(clampSplit(10, bounds)).toBe(25);
    expect(clampSplit(90, bounds)).toBe(70);
    expect(clampSplit(50, bounds)).toBe(50);
  });

  it('falls back to the floor for a value that is not a number', () => {
    // Reachable from a zero-width row during a drag: `fromStart / 0` is
    // Infinity or NaN. Mutant this catches: returning the input unchanged,
    // which would put `flexBasis: NaN%` on the pane and collapse it.
    expect(clampSplit(Number.NaN, { min: 22, max: 74 })).toBe(22);
  });
});

/**
 * The two constants above are copied from Tailwind classes that live on the
 * column components, which `editor-split.ts` cannot read. These render those
 * components and pin the classes, so changing `w-80` fails a test that names
 * the file to update rather than silently drifting the splitter's floor away
 * from the column it is supposed to protect.
 */
describe('the widths those constants stand for', () => {
  it('DisciplineColumn is still w-96 (384px)', () => {
    const { container } = render(
      <DisciplineColumn name="UAS" lessonCount={0}>
        <span />
      </DisciplineColumn>,
    );
    expect(container.firstElementChild?.className).toContain('w-96');
    expect(LIBRARY_COLUMN_WIDTH_PX).toBe(384);
  });

  it('CourseColumn is still w-96 (384px)', () => {
    const { container } = render(
      <CourseColumn
        course={{
          id: 1,
          name: 'Two-Week',
          slug: 'two-week',
          description: null,
          imageUrlAvif: null,
          imageUrlWebp: null,
        }}
      >
        <span />
      </CourseColumn>,
    );
    expect(container.firstElementChild?.className).toContain('w-96');
    expect(COURSE_COLUMN_WIDTH_PX).toBe(384);
  });
});
