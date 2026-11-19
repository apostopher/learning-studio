import { describe, expect, it } from 'vitest';
import {
  buildRoleSections,
  buildRoleSummaries,
  resolveSelectedRole,
} from '../role-permissions-view';

const rowOf = (role: string, entity: string, granted = {}) =>
  buildRoleSections(role, granted)
    .flatMap((s) => s.rows)
    .find((r) => r.entity === entity);

describe('buildRoleSections', () => {
  it('splits org-wide areas from assigned-only ones', () => {
    const [org, assigned] = buildRoleSections('course-manager', {});
    expect(org?.rows.map((r) => r.entity)).toEqual([
      'user',
      'enrolment',
      'level',
      'course',
    ]);
    expect(assigned?.rows.map((r) => r.entity)).toEqual([
      'structure',
      'content',
      'staff',
    ]);
  });

  it('marks the admin bypass as always — and says so truthfully', () => {
    for (const entity of ['structure', 'content']) {
      const row = rowOf('admin', entity);
      expect(row?.kind).toBe('always');
      // An admin already holds these on every course, so the old "assign
      // someone to the course instead" would state the opposite of the truth.
      expect(row?.reason).toMatch(
        /always do this, on every course and discipline/,
      );
      expect(row?.reason).not.toMatch(/Assign someone/);
    }
  });

  it('locks staff for an admin with the org-level reason, showing real grants', () => {
    const row = rowOf('admin', 'staff', { admin: ['staff:read'] });
    expect(row?.kind).toBe('locked');
    expect(row?.reason).toMatch(/org-level role.*Assign someone on the course/);
    // Locked is read-only, not blank: the owner still sees what is held.
    expect(row?.cells.find((c) => c?.action === 'read')?.granted).toBe(true);
    expect(row?.cells.find((c) => c?.action === 'create')?.granted).toBe(false);
  });

  it('lets course-scoped roles toggle every course area', () => {
    for (const role of ['subject-expert', 'course-manager']) {
      for (const entity of ['structure', 'content', 'staff']) {
        expect(rowOf(role, entity)?.kind).toBe('toggle');
        expect(rowOf(role, entity)?.reason).toBeUndefined();
      }
    }
  });

  it('leaves a gap where an action has no endpoint', () => {
    // `enrolment:update` is meaningless — a subscription row has nothing to edit.
    const cells = rowOf('admin', 'enrolment')?.cells ?? [];
    expect(cells.map((c) => c?.action ?? null)).toEqual([
      'read',
      'create',
      null,
      'delete',
    ]);
  });
});

describe('buildRoleSummaries', () => {
  it('counts grants plus bypassed actions, out of every grantable action', () => {
    const [admin, sme] = buildRoleSummaries(['admin', 'subject-expert'], {
      admin: ['user:read'],
      'subject-expert': ['content:read', 'content:update'],
    });
    // 23 grantable actions; admin holds user:read + 8 by bypass.
    expect(admin).toMatchObject({
      name: 'Org Admin',
      heldCount: 9,
      totalCount: 23,
    });
    expect(sme).toMatchObject({ name: 'Subject Expert', heldCount: 2 });
  });
});

describe('resolveSelectedRole', () => {
  it('honours a known role, falls back to the first otherwise', () => {
    const roles = ['admin', 'course-manager'];
    expect(resolveSelectedRole(roles, 'course-manager')).toBe('course-manager');
    expect(resolveSelectedRole(roles, 'owner')).toBe('admin');
    expect(resolveSelectedRole(roles, null)).toBe('admin');
    expect(resolveSelectedRole([], 'admin')).toBeNull();
  });
});
