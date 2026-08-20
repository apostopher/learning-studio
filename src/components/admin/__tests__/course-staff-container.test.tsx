// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseStaffResponse } from '#/data-hooks/use-course-staff';

const m = vi.hoisted(() => ({
  useCourseStaff: vi.fn(),
  useAdminUsers: vi.fn(),
  panel: vi.fn(),
}));

vi.mock('#/data-hooks/use-course-staff', () => ({
  useCourseStaff: m.useCourseStaff,
  useAssignCourseStaff: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveCourseStaff: () => ({ mutate: vi.fn(), isPending: false }),
  CourseStaffRequestError: class extends Error {},
}));
vi.mock('#/data-hooks/use-admin-users', () => ({
  useAdminUsers: m.useAdminUsers,
}));
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

// The panel is the consumer under test: `canAssign` and `assignableRoles` are
// only meaningful if they arrive HERE. Asserting on the container's own state
// would pass even if the props stopped being wired.
vi.mock('../course-staff-panel', () => ({
  CourseStaffPanel: (props: Record<string, unknown>) => {
    m.panel(props);
    return null;
  },
}));

import { CourseStaffContainer } from '../course-staff-container';

const COURSE = {
  id: 7,
  name: 'Private Pilot',
  slug: 'ppl',
  description: null,
  imageUrlAvif: null,
  imageUrlWebp: null,
};

const ROSTER: CourseStaffResponse['staff'] = [
  {
    userId: 'u9',
    email: 'prof@example.com',
    firstName: 'Ada',
    lastName: null,
    roles: ['subject-expert'],
  },
];

function renderWith(data: CourseStaffResponse | null) {
  m.useCourseStaff.mockReturnValue({ data, isLoading: false });
  render(<CourseStaffContainer course={COURSE} />);
  return m.panel.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.useAdminUsers.mockReturnValue({ data: { users: [] } });
});

describe('CourseStaffContainer', () => {
  /**
   * `canAssign` used to be `hasAdminAccess(roles)`. Once /admin admits course
   * staff that silently disabled the control built for them — a subject expert
   * holds no global role at all.
   */
  it('enables assignment for a subject expert, who holds no global role', () => {
    const props = renderWith({
      staff: ROSTER,
      assignableRoles: ['course-manager'],
    });

    expect(props?.canAssign).toBe(true);
    expect(props?.assignableRoles).toEqual(['course-manager']);
  });

  /**
   * The asymmetry the server owns: an admin may appoint either role, a subject
   * expert only a course manager. The container must relay the set verbatim
   * rather than expanding it to "all course-scoped roles" once it sees the
   * form is enabled.
   */
  it("relays an admin's wider set unchanged", () => {
    const props = renderWith({
      staff: ROSTER,
      assignableRoles: ['subject-expert', 'course-manager'],
    });

    expect(props?.assignableRoles).toEqual([
      'subject-expert',
      'course-manager',
    ]);
  });

  it('disables assignment when the server offers no roles', () => {
    const props = renderWith({ staff: ROSTER, assignableRoles: [] });

    expect(props?.canAssign).toBe(false);
    expect(props?.assignableRoles).toEqual([]);
  });

  it('passes the roster through to the panel', () => {
    const props = renderWith({ staff: ROSTER, assignableRoles: [] });

    expect(props?.staff).toEqual(ROSTER);
  });

  /** `null` is the hook's 403 contract — no roster means no trigger at all. */
  it('renders nothing when the actor cannot read this roster', () => {
    const props = renderWith(null);

    expect(props).toBeUndefined();
  });
});
