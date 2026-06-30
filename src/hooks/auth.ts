import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useRequestOtp() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (error) throw error;
    },
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async ({ email, otp }: { email: string; otp: string }) => {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) throw error;
    },
  });
}
