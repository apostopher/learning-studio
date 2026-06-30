import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

const OTP_ERROR_MESSAGES: Record<string, string> = {
  OTP_EXPIRED: "That code has expired. Request a new one.",
  INVALID_OTP: "Incorrect code. Please try again.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a moment and try again.",
};

function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    if (code in OTP_ERROR_MESSAGES) return OTP_ERROR_MESSAGES[code];
  }
  if (error && typeof error === "object" && "message" in error) {
    return (error as { message: string }).message;
  }
  return "Something went wrong. Please try again.";
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (error) throw error;
    },
    meta: { resolveErrorMessage },
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async ({ email, otp }: { email: string; otp: string }) => {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) throw error;
    },
    meta: { resolveErrorMessage },
  });
}
