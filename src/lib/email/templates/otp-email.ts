type OtpEmailType = "sign-in" | "email-verification" | "forget-password" | "change-email";

interface OtpEmailProps {
  otp: string;
  type: OtpEmailType;
  appName?: string;
}

const COPY: Record<OtpEmailType, { subject: string; heading: string; body: string }> = {
  "change-email": {
    subject: "Confirm your new email address",
    heading: "Confirm your new email",
    body: "Use the code below to confirm your new email address. It expires in 10 minutes.",
  },
  "sign-in": {
    subject: "Your sign-in code",
    heading: "Sign in to your account",
    body: "Use the code below to sign in. It expires in 10 minutes.",
  },
  "email-verification": {
    subject: "Verify your email address",
    heading: "Verify your email",
    body: "Use the code below to verify your email address. It expires in 10 minutes.",
  },
  "forget-password": {
    subject: "Reset your password",
    heading: "Reset your password",
    body: "Use the code below to reset your password. It expires in 10 minutes.",
  },
};

export function otpEmailTemplate({ otp, type, appName = "RMTP Studio" }: OtpEmailProps) {
  const { subject, heading, body } = COPY[type];

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

              <!-- OTP code -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#f5f5f5;border-radius:8px;padding:20px;text-align:center;">
                    <span style="font-family:'SF Mono','Fira Code','Fira Mono','Roboto Mono',ui-monospace,monospace;font-size:36px;font-weight:700;color:#1d1d1f;letter-spacing:0.2em;">${otp}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;color:#8e8e93;text-align:center;line-height:1.5;">
                This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8e8e93;line-height:1.6;">
                If you didn't request this code, you can safely ignore this email.<br />
                No action is required.
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
