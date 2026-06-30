import { env } from "../../env";
import { getResendClient } from "./client";
import { otpEmailTemplate } from "./templates/otp-email";

type OtpEmailType = "sign-in" | "email-verification" | "forget-password" | "change-email";

interface SendOtpEmailParams {
  email: string;
  otp: string;
  type: OtpEmailType;
}

export async function sendOtpEmail({ email, otp, type }: SendOtpEmailParams) {
  const { subject, html } = otpEmailTemplate({ otp, type });

  const { error } = await getResendClient().emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}
