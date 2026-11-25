// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

// One React for src modules and react-dom: see material-section-container.test.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('nuqs', () => ({
  useQueryState: (_key: string, options?: { defaultValue?: string }) => [
    options?.defaultValue ?? null,
    vi.fn(),
  ],
}));
const COURSES = [
  { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG },
  { id: 2, name: 'ITPS 2 Week', slug: 'itps-2-week' },
];
vi.mock('#/data-hooks/use-admin-courses', () => ({
  useAdminCourses: () => ({ data: COURSES }),
}));
const idle = vi.hoisted(() => () => ({
  mutate: vi.fn(),
  isPending: false,
  error: null,
  data: undefined,
  isLoading: false,
}));
vi.mock('#/data-hooks/use-admin-users', () => ({
  AdminUsersError: class extends Error {},
  useAddPendingEnrolment: idle,
  useAdminUsers: idle,
  useRolePermissions: idle,
  useSetRolePermission: idle,
  useSetUserEnrolment: idle,
  useSetUserRole: idle,
  useUpdateUserProfile: idle,
}));
vi.mock('#/data-hooks/use-user-levels', () => ({
  useSetUserLevel: idle,
  useUserLevelHistory: idle,
}));
vi.mock('../user-disciplines-container', () => ({
  UserDisciplinesContainer: () => null,
}));
vi.mock('../set-level-dialog', () => ({ SetLevelDialog: () => null }));
/** What each consumer of the course list was handed. */
const seen = vi.hoisted(() => ({
  modal: vi.fn(),
  add: vi.fn(),
  table: vi.fn(),
}));
vi.mock('../user-detail-modal', () => ({
  UserDetailModal: (p: { allCourses: unknown }) => {
    seen.modal(p.allCourses);
    return null;
  },
}));
vi.mock('../add-person-dialog', () => ({
  AddPersonDialog: (p: { courses: unknown }) => {
    seen.add(p.courses);
    return null;
  },
}));
vi.mock('../users-table', () => ({
  UsersTable: (p: { courses: unknown }) => {
    seen.table(p.courses);
    return null;
  },
}));

import { UsersPageContainer } from '../users-page-container';

beforeEach(() => {
  for (const spy of Object.values(seen)) spy.mockClear();
  render(
    <Provider>
      <UsersPageContainer roles={['owner']} permissions={[]} />
    </Provider>,
  );
});

// 3D Airmanship is part of every other course, so it is never assigned.
describe('the courses People works with', () => {
  it('does not offer the flagship in a person’s courses', () => {
    expect(seen.modal.mock.lastCall?.[0]).toEqual([
      { id: 2, name: 'ITPS 2 Week' },
    ]);
  });

  it('does not offer it when adding a person', () => {
    expect(seen.add.mock.lastCall?.[0]).toEqual([
      { id: 2, name: 'ITPS 2 Week' },
    ]);
  });

  it('still filters the list by it, for people already enrolled', () => {
    expect(seen.table.mock.lastCall?.[0]).toEqual([
      { id: 6, name: '3D Airmanship' },
      { id: 2, name: 'ITPS 2 Week' },
    ]);
  });
});
