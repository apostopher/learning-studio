// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrollArea } from '../scroll-area';

describe('ScrollArea', () => {
  it('renders children inside the viewport', () => {
    render(
      <ScrollArea>
        <p>CHILD_CONTENT</p>
      </ScrollArea>,
    );
    expect(screen.getByText('CHILD_CONTENT')).toBeDefined();
  });

  it('renders a vertical scrollbar by default', () => {
    const { container } = render(
      <ScrollArea>
        <p>content</p>
      </ScrollArea>,
    );
    expect(
      container.querySelector(
        '.scroll-area-scrollbar[data-orientation="vertical"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.scroll-area-scrollbar[data-orientation="horizontal"]',
      ),
    ).toBeNull();
  });

  it('renders a horizontal scrollbar when orientation="horizontal"', () => {
    const { container } = render(
      <ScrollArea orientation="horizontal">
        <p>content</p>
      </ScrollArea>,
    );
    expect(
      container.querySelector(
        '.scroll-area-scrollbar[data-orientation="horizontal"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.scroll-area-scrollbar[data-orientation="vertical"]',
      ),
    ).toBeNull();
  });

  it('renders both scrollbars when orientation="both"', () => {
    const { container } = render(
      <ScrollArea orientation="both">
        <p>content</p>
      </ScrollArea>,
    );
    expect(
      container.querySelector(
        '.scroll-area-scrollbar[data-orientation="vertical"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.scroll-area-scrollbar[data-orientation="horizontal"]',
      ),
    ).not.toBeNull();
  });

  /**
   * Base UI puts a hardcoded inline `overflow: scroll` on its Viewport, so the
   * cross axis has to be clipped inline too or it silently stays a scroll
   * container and rubber-bands sideways on a trackpad gesture. Assert on the
   * viewport's own inline style, which is the only thing the browser reads.
   */
  it('clips the horizontal axis inline when orientation="vertical"', () => {
    const { container } = render(
      <ScrollArea orientation="vertical">
        <p>content</p>
      </ScrollArea>,
    );
    const viewport = container.querySelector<HTMLElement>(
      '.scroll-area-viewport',
    );
    expect(viewport?.style.overflowX).toBe('clip');
    expect(viewport?.style.overflowY).not.toBe('clip');
  });

  it('clips the vertical axis inline when orientation="horizontal"', () => {
    const { container } = render(
      <ScrollArea orientation="horizontal">
        <p>content</p>
      </ScrollArea>,
    );
    const viewport = container.querySelector<HTMLElement>(
      '.scroll-area-viewport',
    );
    expect(viewport?.style.overflowY).toBe('clip');
    expect(viewport?.style.overflowX).not.toBe('clip');
  });

  it('scrolls both axes when orientation="both"', () => {
    const { container } = render(
      <ScrollArea orientation="both">
        <p>content</p>
      </ScrollArea>,
    );
    const viewport = container.querySelector<HTMLElement>(
      '.scroll-area-viewport',
    );
    expect(viewport?.style.overflowX).not.toBe('clip');
    expect(viewport?.style.overflowY).not.toBe('clip');
  });

  /**
   * The bug: a course column inside the horizontal rail could not scroll its
   * lessons. Base UI's Content element has `min-width: fit-content` and NO
   * height, so its block size came from its children — measured in the
   * browser, 1211px of content inside a 400px pane. Every `h-full` below it
   * then resolved against an auto height and became auto, so each column grew
   * to its full content height and its own scroller had nothing to shrink
   * into: `scrollHeight === clientHeight`, a scroller that could never scroll.
   *
   * Asserted on the CONTENT element's inline style, because that is the only
   * thing the browser reads here — Base UI sets this element's geometry
   * inline, where a stylesheet rule would lose to it.
   */
  it("gives a horizontal area's content a definite block size", () => {
    const { container } = render(
      <ScrollArea orientation="horizontal">
        <p>content</p>
      </ScrollArea>,
    );
    const content = container.querySelector<HTMLElement>(
      '.scroll-area-content',
    );
    expect(content?.style.blockSize).toBe('100%');
  });

  /**
   * The other half, and the one that matters more: a VERTICAL area's content
   * has to be free to exceed the viewport, because that overflow is the whole
   * point of it.
   *
   * Mutant seen RED: `blockSize: '100%'` applied unconditionally rather than
   * per orientation — which fixes the rail and silently stops every vertical
   * scroll area in the app from scrolling at all.
   */
  it("leaves a vertical area's content free to overflow", () => {
    const { container } = render(
      <ScrollArea orientation="vertical">
        <p>content</p>
      </ScrollArea>,
    );
    const content = container.querySelector<HTMLElement>(
      '.scroll-area-content',
    );
    expect(content?.style.blockSize).toBe('');
  });

  it('leaves content free to overflow on both axes when orientation="both"', () => {
    const { container } = render(
      <ScrollArea orientation="both">
        <p>content</p>
      </ScrollArea>,
    );
    const content = container.querySelector<HTMLElement>(
      '.scroll-area-content',
    );
    expect(content?.style.blockSize).toBe('');
  });

  it('applies optional className on the root and viewport', () => {
    const { container } = render(
      <ScrollArea className="outer" viewportClassName="inner">
        <p>content</p>
      </ScrollArea>,
    );
    const root = container.querySelector('.scroll-area-root');
    const viewport = container.querySelector('.scroll-area-viewport');
    expect(root?.className).toContain('outer');
    expect(viewport?.className).toContain('inner');
  });
});
