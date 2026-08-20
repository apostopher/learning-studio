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
// `removableRoles` and `people` are only meaningful if they arrive HERE.
// Asserting on the container's own state would pass even if the props stopped
// being wired.
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
  removableRoles: ['course-manager'],
  selfUserId: 'sme-1',
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
  // A fresh jotai store per render: the picker's atoms are keyed by course id
  // but still live in one store, so one test's typing must not leak into the
  // next.
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
      removableRoles: ['subject-expert', 'course-manager'],
      selfUserId: 'admin-1',
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
      removableRoles: ['course-manager'],
      selfUserId: 'sme-1',
    });

    expect(props?.canAssign).toBe(false);
    expect(props?.assignableRoles).toEqual([]);
  });

  /**
   * `staff:delete` is granted separately from `staff:create`, AND removal is
   * railed by role — an SME may dismiss an assistant, never a peer. The
   * container must relay the set verbatim, not collapse it to a flag.
   */
  it("relays the server's removable set verbatim", () => {
    const props = renderWith(SME_VIEW);

    expect(props?.removableRoles).toEqual(['course-manager']);
  });

  it('relays an empty removable set', () => {
    const props = renderWith({ ...SME_VIEW, removableRoles: [] });

    expect(props?.removableRoles).toEqual([]);
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

  /** The actor's own id has to reach the panel, or the Remove control on their
   * own badge — the only one the role rail exempts — is never drawn. */
  it('tells the panel who it is drawing for', () => {
    const props = renderWith(SME_VIEW);

    expect(props?.selfUserId).toBe('sme-1');
  });

  /**
   * The picker's state is per course, not per app. It used to be four
   * module-global atoms, so a person picked on course A was still selected
   * when the dialog opened on course B — one click away from being assigned to
   * the wrong course.
   */
  it('does not carry a selection from one course into another', () => {
    m.useCourseStaff.mockReturnValue({ data: SME_VIEW, isLoading: false });
    m.useCourseStaffCandidates.mockReturnValue({
      data: CANDIDATES,
      isFetching: false,
    });
    // ONE store across both courses — a per-test store would hide the bug
    // this test exists for.
    const store = createStore();

    render(
      <Provider store={store}>
        <CourseStaffContainer course={COURSE} />
      </Provider>,
    );
    act(() => {
      (lastPanelProps()?.onSelectedUserIdChange as (id: string) => void)('u3');
    });
    expect(lastPanelProps()?.selectedUserId).toBe('u3');

    render(
      <Provider store={store}>
        <CourseStaffContainer course={{ ...COURSE, id: 8, slug: 'cpl' }} />
      </Provider>,
    );

    // The consumer is the panel: course 8's picker must arrive with nothing
    // selected, whatever course 7's picker still holds.
    expect(lastPanelProps()?.selectedUserId).toBeNull();
  });
});
