// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Full stub, not importOriginal: this test only needs `Link` to render as a
// real anchor with its props visible to Testing Library, not the generated
// route tree — same pattern as `delete-course-dialog-container.test.tsx`.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      href={`${to}/${params ? Object.values(params).join('/') : ''}`}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { moduleProvenance } from '../module-provenance';

describe('moduleProvenance', () => {
  it('returns undefined for a module the course owns', () => {
    expect(
      moduleProvenance({ owner: { id: 6, name: '3D Airmanship' } }, 6),
    ).toBeUndefined();
  });

  it('names the owner and links to its board for a borrowed module', () => {
    const provenance = moduleProvenance(
      { owner: { id: 6, name: '3D Airmanship' } },
      9,
    );
    expect(provenance?.ownerName).toBe('3D Airmanship');

    render(provenance?.editLinkSlot);
    expect(
      screen.getByRole('link', {
        name: 'Edited in 3D Airmanship — open its board to change this module',
      }),
    ).toBeTruthy();
  });
});
