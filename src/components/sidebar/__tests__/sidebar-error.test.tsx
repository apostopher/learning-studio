// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarError } from '../sidebar-error';

describe('SidebarError', () => {
  it('renders the provided message', () => {
    render(<SidebarError message="Boom" />);
    expect(screen.getByRole('alert').textContent).toBe('Boom');
  });

  it('renders a default message when none is provided', () => {
    render(<SidebarError />);
    expect(screen.getByRole('alert').textContent).toBe(
      "Couldn't load the course",
    );
  });
});
