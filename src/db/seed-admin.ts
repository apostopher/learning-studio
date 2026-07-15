import { eq } from 'drizzle-orm';
import { user as authUserTable } from '@/db/auth-schema';
import {
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '@/db/schema';
import { db } from '.';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm db:grant-admin <email>');
    process.exit(1);
  }

  // 1. Ensure the admin role exists.
  await db
    .insert(userRolesTable)
    .values({ name: 'admin', description: 'Full administrative access' })
    .onConflictDoNothing();
  const [role] = await db
    .select()
    .from(userRolesTable)
    .where(eq(userRolesTable.name, 'admin'));
  if (!role) {
    console.error("Failed to create or find the 'admin' role.");
    process.exit(1);
  }

  // 2. Ensure a user_profiles row exists for this email, backed by the auth user.
  let [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.email, email));
  if (!profile) {
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
    await db
      .insert(userProfileTable)
      .values({ userId: account.id, email })
      .onConflictDoNothing();
    [profile] = await db
      .select()
      .from(userProfileTable)
      .where(eq(userProfileTable.email, email));
    if (!profile) {
      console.error(`Failed to create a user profile for ${email}.`);
      process.exit(1);
    }
    console.log(
      `Created user profile ${profile.id} for ${email} (auth user ${account.id}).`,
    );
  }

  // 3. Grant the admin role.
  await db
    .insert(userProfileRolesTable)
    .values({ userProfileId: profile.id, roleId: role.id, assignedBy: 'seed' })
    .onConflictDoNothing();

  console.log(
    `Granted 'admin' to ${email} (profile ${profile.id}, role ${role.id}).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
