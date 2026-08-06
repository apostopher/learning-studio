import { eq } from 'drizzle-orm';
import { user as authUserTable } from '#/db/auth-schema';
import {
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';
import { ensureUserProfile } from '#/db/user-profile';
import { db } from '.';

/**
 * Grant a role to an account by email — the manual bootstrap path.
 *
 * Generalises the old `db:grant-admin`, which is now an alias defaulting to
 * `admin`. The first `owner` has to be created this way by definition: role
 * assignment is owner-only, so there is no in-app path until one exists.
 *
 *   pnpm db:grant-role <email> owner
 *   pnpm db:grant-admin <email>          # same thing, role defaults to admin
 */
async function main() {
  const email = process.argv[2];
  const roleName = process.argv[3] ?? 'admin';
  if (!email) {
    console.error('Usage: pnpm db:grant-role <email> [role]');
    process.exit(1);
  }

  const [role] = await db
    .select()
    .from(userRolesTable)
    .where(eq(userRolesTable.name, roleName));
  if (!role) {
    const all = await db
      .select({ name: userRolesTable.name })
      .from(userRolesTable);
    console.error(
      `No role named '${roleName}'. Known roles: ${all.map((r) => r.name).join(', ') || '(none)'}.`,
    );
    process.exit(1);
  }

  const [account] = await db
    .select()
    .from(authUserTable)
    .where(eq(authUserTable.email, email));
  if (!account) {
    console.error(
      `No account found for ${email}. Sign in once via the app first.`,
    );
    process.exit(1);
  }

  // Reuses the same helper the sign-in hook uses, so the script can't drift
  // from how profiles are actually created.
  await ensureUserProfile(account.id, email);

  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, account.id));
  if (!profile) {
    console.error(`Failed to create a user profile for ${email}.`);
    process.exit(1);
  }

  await db
    .insert(userProfileRolesTable)
    .values({
      userProfileId: profile.id,
      roleId: role.id,
      // A real actor is unknowable from a shell; 'script' at least
      // distinguishes it from a grant made by an owner in the UI, which
      // records their user id.
      assignedBy: 'script',
    })
    .onConflictDoNothing();

  console.log(
    `Granted '${roleName}' to ${email} (profile ${profile.id}, role ${role.id}).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
