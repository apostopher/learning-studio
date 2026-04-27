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
