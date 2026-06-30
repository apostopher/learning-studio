import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  authEmailAtom,
  authStepAtom,
  nowAtom,
  resendAvailableAtAtom,
} from "../../atoms/auth";
import { useRequestOtp, useVerifyOtp } from "../../hooks/auth";
import { AuthCard } from "./auth-card";
import { AuthLayout } from "./auth-layout";
import { EmailStepForm } from "./email-step-form";
import { OtpStepForm } from "./otp-step-form";

const RESEND_COOLDOWN_MS = 30_000;

const emailSchema = z.object({
  email: z
    .string()
    .min(1, "Enter your email address")
    .email("Enter a valid email address"),
});

const otpSchema = z.object({
  otp: z
    .string()
    .min(1, "Enter the 6-digit code")
    .length(6, "The code must be exactly 6 digits")
    .regex(/^\d+$/, "The code must contain only digits"),
});

type EmailFormData = z.infer<typeof emailSchema>;
type OtpFormData = z.infer<typeof otpSchema>;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}${"•".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

interface AuthFlowContainerProps {
  redirect?: string;
}

export const AuthFlowContainer = ({ redirect }: AuthFlowContainerProps) => {
  const navigate = useNavigate();
  const [step, setStep] = useAtom(authStepAtom);
  const [email, setEmail] = useAtom(authEmailAtom);
  const [resendAvailableAt, setResendAvailableAt] = useAtom(resendAvailableAtAtom);
  const [now, setNow] = useAtom(nowAtom);

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    mode: "onSubmit",
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    mode: "onSubmit",
  });

  // Tick "now" every second while on the OTP step to drive the resend countdown.
  useEffect(() => {
    if (step !== "otp") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step, setNow]);

  const resendCountdown = Math.max(
    0,
    Math.ceil((resendAvailableAt - now) / 1000),
  );

  const handleEmailSubmit = emailForm.handleSubmit(async ({ email: value }) => {
    requestOtp.reset();
    await requestOtp.mutateAsync(value, {
      onSuccess: () => {
        setEmail(value);
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
        setStep("otp");
        otpForm.reset();
      },
    });
  });

  const handleOtpSubmit = otpForm.handleSubmit(async ({ otp }) => {
    verifyOtp.reset();
    await verifyOtp.mutateAsync(
      { email, otp },
      {
        onSuccess: () => {
          setStep("email");
          setEmail("");
          navigate({ to: (redirect as string | undefined) ?? "/app" });
        },
      },
    );
  });

  const handleResend = async () => {
    requestOtp.reset();
    await requestOtp.mutateAsync(email, {
      onSuccess: () => {
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
        otpForm.reset();
        otpForm.setFocus("otp");
      },
    });
  };

  const handleBack = () => {
    setStep("email");
    requestOtp.reset();
    verifyOtp.reset();
    otpForm.reset();
  };

  const stepVariants = {
    enter: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  const resolveErrorMessage = (error: unknown): string | undefined => {
    if (!error) return undefined;
    if (error && typeof error === "object" && "code" in error) {
      const codes: Record<string, string> = {
        OTP_EXPIRED: "That code has expired. Request a new one.",
        INVALID_OTP: "Incorrect code. Please try again.",
        TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a moment and try again.",
      };
      const code = (error as { code: string }).code;
      if (code in codes) return codes[code];
    }
    if (error && typeof error === "object" && "message" in error) {
      return (error as { message: string }).message;
    }
    return "Something went wrong. Please try again.";
  };

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {step === "email" ? (
          <motion.div
            key="email"
            variants={stepVariants}
            initial="enter"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="w-full"
          >
            <AuthCard
              heading="Sign in to your account"
              description="Enter your email and we'll send you a sign-in code."
            >
              <EmailStepForm
                onSubmit={handleEmailSubmit}
                registerEmail={emailForm.register("email")}
                fieldError={emailForm.formState.errors.email?.message}
                serverError={resolveErrorMessage(requestOtp.error)}
                isLoading={requestOtp.isPending}
              />
            </AuthCard>
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            variants={stepVariants}
            initial="enter"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="w-full"
          >
            <AuthCard
              heading="Check your email"
              description={`Enter the code we sent to verify it's you.`}
            >
              <OtpStepForm
                maskedEmail={maskEmail(email)}
                onSubmit={handleOtpSubmit}
                registerOtp={otpForm.register("otp")}
                fieldError={otpForm.formState.errors.otp?.message}
                serverError={resolveErrorMessage(verifyOtp.error ?? (requestOtp.isError && step === "otp" ? requestOtp.error : null))}
                isLoading={verifyOtp.isPending}
                onResend={handleResend}
                isResending={requestOtp.isPending}
                resendCountdown={resendCountdown}
                onBack={handleBack}
              />
            </AuthCard>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
};
