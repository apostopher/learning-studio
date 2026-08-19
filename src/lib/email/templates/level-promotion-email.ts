import { levelLabel } from '#/lib/level-labels';
import type { UserLevel } from '#/types';

interface LevelPromotionEmailProps {
  courseName: string;
  level: UserLevel;
  appName?: string;
}

export function levelPromotionEmailTemplate({
  courseName,
  level,
  appName = 'RMTP Studio',
}: LevelPromotionEmailProps) {
  const label = levelLabel(level);
  const subject = `You've reached ${label} in ${courseName}`;
  const heading = `You're now ${label}`;
  const body = `You've completed every lesson at your previous level in ${courseName}. Your ${label} lessons are now available.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:13px;font-weight:600;color:#1d1d1f;letter-spacing:0.04em;text-transform:uppercase;">${appName}</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:40px 40px 32px;">

              <!-- Heading -->
              <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#1d1d1f;line-height:1.3;">${heading}</p>
              <p style="margin:0 0 32px;font-size:15px;color:#6e6e73;line-height:1.6;">${body}</p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8e8e93;line-height:1.6;">
                Keep flying. You'll see your new lessons next time you open ${courseName}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
