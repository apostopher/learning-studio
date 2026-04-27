// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ResizeHandle } from '../resize-handle';

function readWidth(): number {
  return parseInt(
    document.documentElement.style.getPropertyValue('--sidebar-width'),
    10,
  );
}

beforeEach(() => {
  document.documentElement.dir = '';
  document.documentElement.style.setProperty('--sidebar-width', '320px');
  document.documentElement.style.setProperty('--sidebar-width-min', '300px');
  document.documentElement.style.setProperty('--sidebar-width-max', '400px');
});

describe('ResizeHandle', () => {
  it('exposes correct ARIA contract', () => {
    render(<ResizeHandle controlledAsideId="aside" />);
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe('300');
    expect(handle.getAttribute('aria-valuemax')).toBe('400');
    expect(handle.getAttribute('aria-controls')).toBe('aside');
  });

  it('decreases the width by the step on ArrowLeft', () => {
    render(<ResizeHandle />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(readWidth()).toBe(312);
  });

  it('increases the width by the step on ArrowRight', () => {
    render(<ResizeHandle />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(readWidth()).toBe(328);
  });

  it('clamps to the min when ArrowLeft would underflow', () => {
    document.documentElement.style.setProperty('--sidebar-width', '300px');
    render(<ResizeHandle />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(readWidth()).toBe(300);
  });

  it('clamps to the max when ArrowRight would overflow', () => {
    document.documentElement.style.setProperty('--sidebar-width', '400px');
    render(<ResizeHandle />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(readWidth()).toBe(400);
  });

  it('Enter collapses to min and a second Enter restores the previous width', () => {
    render(<ResizeHandle />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(readWidth()).toBe(300);
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(readWidth()).toBe(320);
  });

  it('inverts arrow keys in RTL (ArrowLeft grows, ArrowRight shrinks)', () => {
    document.documentElement.dir = 'rtl';
    render(<ResizeHandle />);
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(readWidth()).toBe(328);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(readWidth()).toBe(320);
  });
});
