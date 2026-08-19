import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type AddPendingEnrolmentInput,
  adminUsersResponseSchema,
  type UpdateUserProfileInput,
} from '#/lib/admin-schemas';
import { dataKeys } from './keys';

/** Error carrying the HTTP status, so 409s can be shown differently to 403s. */
export class AdminUsersError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminUsersError';
    this.status = status;
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    // Non-JSON body (e.g. the plain "Forbidden") — keep the fallback.
  }
  throw new AdminUsersError(message, res.status);
}

/** Accounts and never-signed-in invitees in one payload. */
export function useAdminUsers() {
  return useQuery({
    queryKey: dataKeys.adminUsers(),
    queryFn: async () => {
      const res = await fetch('/api/admin/users');
      if (!res.ok) await readError(res, `Failed to load users (${res.status})`);
      return adminUsersResponseSchema.parse(await res.json());
    },
    staleTime: 30_000,
  });
}

const rolePermissionsResponseSchema = z.object({
  roles: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      description: z.string().nullable(),
    }),
  ),
  permissions: z.record(z.string(), z.array(z.string())),
});

/** Owner-only. `enabled` keeps a non-owner from firing a guaranteed 403. */
export function useRolePermissions(enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.rolePermissions(),
    queryFn: async () => {
      const res = await fetch('/api/admin/role-permissions');
      if (!res.ok) {
        await readError(res, `Failed to load permissions (${res.status})`);
      }
      return rolePermissionsResponseSchema.parse(await res.json());
    },
    staleTime: 30_000,
    enabled,
  });
}

/** Shared by every mutation here, and by the levels hooks in use-user-levels.ts. */
export function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: dataKeys.adminUsers() });
  };
}

export function useAddPendingEnrolment() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (input: AddPendingEnrolmentInput) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) await readError(res, 'Could not add that person');
    },
    onSuccess: invalidate,
  });
}

export function useUpdateUserProfile(profileId: number) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (input: UpdateUserProfileInput) => {
      const res = await fetch(`/api/admin/users/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) await readError(res, 'Could not save those changes');
    },
    onSuccess: invalidate,
  });
}

export function useSetUserEnrolment(profileId: number) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (vars: { courseId: number; granted: boolean }) => {
      const res = await fetch(`/api/admin/users/${profileId}/enrolments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!res.ok) await readError(res, 'Could not update the course');
    },
    onSuccess: invalidate,
  });
}

export function useSetUserRole(profileId: number) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (vars: { role: string; granted: boolean }) => {
      const res = await fetch(`/api/admin/users/${profileId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!res.ok) await readError(res, 'Could not update the role');
    },
    onSuccess: invalidate,
  });
}

export function useSetRolePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      role: string;
      entity: string;
      action: string;
      granted: boolean;
    }) => {
      const res = await fetch('/api/admin/role-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!res.ok) await readError(res, 'Could not update the permission');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataKeys.rolePermissions() });
    },
  });
}
