import { selectOpenAttemptQuestions } from '#/db/debrief-attempts';
import { getUserRoleNames } from '#/db/user-roles';
import { hasAdminAccess } from '#/lib/admin-schemas';

/**
 * The questions Viper must not answer for this user right now: those of their
 * unfinished debriefs. None for an org admin or owner, who test debriefs and
 * may take a question to Viper — the same people the debrief lets copy one.
 */
export async function findOpenDebriefQuestions(
  userId: string,
): Promise<string[]> {
  const [roles, questions] = await Promise.all([
    getUserRoleNames(userId),
    selectOpenAttemptQuestions(userId),
  ]);
  return hasAdminAccess(roles) ? [] : questions;
}
