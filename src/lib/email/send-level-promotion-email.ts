import type { UserLevel } from '#/types';
import { env } from '../../env';
import { getResendClient } from './client';
import { levelPromotionEmailTemplate } from './templates/level-promotion-email';

interface SendLevelPromotionEmailParams {
  email: string;
  courseName: string;
  level: UserLevel;
}

export async function sendLevelPromotionEmail({
  email,
  courseName,
  level,
}: SendLevelPromotionEmailParams) {
  // Same development escape hatch as sendVerificationOTP's call site in
  // src/lib/auth.ts: no live sends from a dev machine.
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[DEV] Promotion email for ${email}: ${level} in ${courseName}`,
    );
    return;
  }

  const { subject, html } = levelPromotionEmailTemplate({ courseName, level });

  const { error } = await getResendClient().emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send promotion email: ${error.message}`);
  }
}
