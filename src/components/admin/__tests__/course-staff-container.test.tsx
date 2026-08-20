// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CourseStaffResponse,
  StaffCandidate,
} from '#/data-hooks/use-course-staff';

const m = vi.hoisted(() => ({
  useCourseStaff: vi.fn(),
  useCourseStaffCandidates: vi.fn(),
  panel: vi.fn(),
}));

vi.mock('#/data-hooks/use-course-staff', () => ({
  useCourseStaff: m.useCourseStaff,
  useCourseStaffCandidates: m.useCourseStaffCandidates,
  useAssignCourseStaff: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveCourseStaff: () => ({ mutate: vi.fn(), isPending: false }),
  CourseStaffRequestError: class extends Error {},
}));
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

// The panel is the consumer under test: `canAssign`, `assignableRoles`,
// `canRemove` and `people` are only meaningful if they arrive HERE. Asserting
// on the container's own state would pass even if the props stopped being
// wired.
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

const SME_VIEW: CourseStaffResponse = {
  staff: ROSTER,
  assignableRoles: ['course-manager'],
  canRemove: true,
};

const CANDIDATES: StaffCandidate[] = [
  {
    userId: 'u3',
    email: 'sam@example.com',
    firstName: 'Sam',
    lastName: 'Lee',
  },
  { userId: 'u4', email: 'kim@example.com', firstName: null, lastName: null },
];

function renderWith(
  data: CourseStaffResponse | null,
  candidates: {
    data?: StaffCandidate[];
    isFetching?: boolean;
  } = {},
) {
  m.useCourseStaff.mockReturnValue({ data, isLoading: false });
  m.useCourseStaffCandidates.mockReturnValue({
    data: candidates.data,
    isFetching: candidates.isFetching ?? false,
  });
  // A fresh jotai store per render: the search term and the selected person
  // are module-level atoms, and one test's typing must not leak into the next.
  render(
    <Provider store={createStore()}>
      <CourseStaffContainer course={COURSE} />
    </Provider>,
  );
  return lastPanelProps();
}

function lastPanelProps() {
  return m.panel.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CourseStaffContainer', () => {
  /**
   * `canAssign` used to be `hasAdminAccess(roles)`. Once /admin admits course
   * staff that silently disabled the control built for them — a subject expert
   * holds no global role at all.
   */
  it('enables assignment for a subject expert, who holds no global role', () => {
    const props = renderWith(SME_VIEW);

    expect(props?.canAssign).toBe(true);
    expect(props?.assignableRoles).toEqual(['course-manager']);
  });

  /**
   * The Critical from review round 1. `canAssign` was true, the form
   * rendered — and the picker was fed by `/api/admin/users`, which requires
   * `user:read` and has an admin floor. An SME got a 403, `data` was
   * `undefined`, `?? []` swallowed it, and the form offered nobody with no
   * error shown anywhere.
   */
  it('offers the searched candidates to a subject expert', () => {
    const props = renderWith(SME_VIEW, { data: CANDIDATES });

    expect(props?.people).toEqual([
      { userId: 'u3', label: 'Sam Lee (sam@example.com)' },
      { userId: 'u4', label: 'kim@example.com' },
    ]);
  });

  it('asks the course-scoped search, not the org directory', () => {
    renderWith(SME_VIEW, { data: CANDIDATES });

    // Scoped to THIS course: the endpoint behind it is guarded on
    // `staff:create` for this course, the same authority as the appointment.
    expect(m.useCourseStaffCandidates).toHaveBeenCalledWith(7, '');
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
      canRemove: true,
    });

    expect(props?.assignableRoles).toEqual([
      'subject-expert',
      'course-manager',
    ]);
  });

  it('disables assignment when the server offers no roles', () => {
    const props = renderWith({
      staff: ROSTER,
      assignableRoles: [],
      canRemove: true,
    });

    expect(props?.canAssign).toBe(false);
    expect(props?.assignableRoles).toEqual([]);
  });

  /** `staff:delete` is granted separately from `staff:create`. */
  it("relays the server's removal verdict", () => {
    const props = renderWith({ ...SME_VIEW, canRemove: false });

    expect(props?.canRemove).toBe(false);
  });

  it('passes the roster through to the panel', () => {
    const props = renderWith(SME_VIEW);

    expect(props?.staff).toEqual(ROSTER);
  });

  /**
   * The empty label has to distinguish "the server has not been asked yet"
   * from "the server answered nobody" — otherwise a too-short term reads as
   * "this person does not exist".
   */
  it('prompts for a longer term before it has searched', () => {
    const props = renderWith(SME_VIEW);

    expect(props?.peopleEmptyLabel).toBe(
      'Type at least 2 characters to search',
    );
  });

  it('reports a search in flight rather than claiming nobody matched', () => {
    const props = renderWith(SME_VIEW, { isFetching: true });

    // Type through the panel's own callback — that is the only path the real
    // picker has, so this also pins the callback to the query atom.
    act(() => {
      (props?.onPeopleQueryChange as (q: string) => void)('sa');
    });

    expect(lastPanelProps()?.peopleEmptyLabel).toBe('Searching…');
  });

  it('says nobody matched once a real search has come back empty', () => {
    const props = renderWith(SME_VIEW, { data: [], isFetching: false });

    act(() => {
      (props?.onPeopleQueryChange as (q: string) => void)('zz');
    });

    expect(lastPanelProps()?.peopleEmptyLabel).toBe('No matching people');
  });

  /**
   * The search term is what the hook is asked for — a picker whose typing
   * never reached the query would search for the empty string forever.
   */
  it('sends what was typed to the candidate search', () => {
    const props = renderWith(SME_VIEW, { data: CANDIDATES });

    act(() => {
      (props?.onPeopleQueryChange as (q: string) => void)('sam');
    });

    expect(m.useCourseStaffCandidates).toHaveBeenLastCalledWith(7, 'sam');
  });

  /** `null` is the hook's 403 contract — no roster means no trigger at all. */
  it('renders nothing when the actor cannot read this roster', () => {
    const props = renderWith(null);

    expect(props).toBeUndefined();
  });
});
