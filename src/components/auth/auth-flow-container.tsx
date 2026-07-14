import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useMachine } from '@xstate/react';
import { useAtomValue, useStore } from 'jotai';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  authEmailAtom,
  authErrorAtom,
  resendCountdownAtom,
} from '../../atoms/auth';
import { useRequestOtp, useVerifyOtp } from '../../hooks/auth';
import {
  authLoginMachine,
  createAuthLoginImplementations,
} from '../../machines/auth-login-machine';
import { AuthCard } from './auth-card';
import { AuthLayout } from './auth-layout';
import { EmailStepForm } from './email-step-form';
import { OtpStepForm } from './otp-step-form';

const emailSchema = z.object({
  email: z
    .string()
    .min(1, 'Enter your email address')
    .email('Enter a valid email address'),
});

const otpSchema = z.object({
  otp: z
    .string()
    .min(1, 'Enter the 6-digit code')
    .length(6, 'The code must be exactly 6 digits')
    .regex(/^\d+$/, 'The code must contain only digits'),
});

type EmailFormData = z.infer<typeof emailSchema>;
type OtpFormData = z.infer<typeof otpSchema>;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}${'•'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}

interface AuthFlowContainerProps {
  redirect?: string;
}

export const AuthFlowContainer = ({ redirect }: AuthFlowContainerProps) => {
  const store = useStore();
  const router = useRouter();
  const navigate = useNavigate();
  const shouldReduce = useReducedMotion();

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  // Stable dependency callbacks so the provided machine identity does not churn
  // (which would restart the actor and drop flow state). react-query's
  // mutateAsync is referentially stable, and router/navigate/redirect are
  // constant for the flow's lifetime.
  const sendOtp = useCallback(
    (email: string) => requestOtp.mutateAsync(email),
    [requestOtp.mutateAsync],
  );
  const verify = useCallback(
    (args: { email: string; otp: string }) => verifyOtp.mutateAsync(args),
    [verifyOtp.mutateAsync],
  );
  const redirectFn = useCallback(async () => {
    // Re-run the root beforeLoad so the freshly-set session lands in router
    // context, then navigate. Both live inside the machine's redirect actor.
    await router.invalidate();
    await navigate({ to: redirect ?? '/app' });
  }, [router, navigate, redirect]);

  const machine = useMemo(
    () =>
      authLoginMachine.provide(
        createAuthLoginImplementations({
          store,
          sendOtp,
          verifyOtp: verify,
          redirect: redirectFn,
        }),
      ),
    [store, sendOtp, verify, redirectFn],
  );

  const [state, send] = useMachine(machine);

  const email = useAtomValue(authEmailAtom);
  const serverError = useAtomValue(authErrorAtom) ?? undefined;
  const resendCountdown = useAtomValue(resendCountdownAtom);

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    mode: 'onSubmit',
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    mode: 'onSubmit',
  });

  const handleEmailSubmit = emailForm.handleSubmit(({ email: value }) => {
    send({ type: 'SUBMIT_EMAIL', email: value });
    otpForm.reset();
  });

  const handleOtpSubmit = otpForm.handleSubmit(({ otp }) => {
    send({ type: 'SUBMIT_OTP', otp });
  });

  const handleResend = () => {
    send({ type: 'RESEND' });
    otpForm.reset();
    otpForm.setFocus('otp');
  };

  const handleBack = () => {
    send({ type: 'BACK' });
    otpForm.reset();
  };

  const onEmailScreen =
    state.matches('emailEntry') || state.matches('sendingOtp');

  const stepVariants = {
    enter: { opacity: 0, y: shouldReduce ? 0 : 8 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: shouldReduce ? 0 : -8 },
  };

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {onEmailScreen ? (
          <motion.div
            key="email"
            variants={stepVariants}
            initial="enter"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="w-full"
          >
            <AuthCard
              heading="Sign in to your account"
              description="Enter your email and we'll send you a sign-in code."
            >
              <EmailStepForm
                onSubmit={handleEmailSubmit}
                registerEmail={emailForm.register('email')}
                fieldError={emailForm.formState.errors.email?.message}
                serverError={serverError}
                isLoading={state.matches('sendingOtp')}
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
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="w-full"
          >
            <AuthCard
              heading="Check your email"
              description="Enter the code we sent to verify it's you."
            >
              <OtpStepForm
                maskedEmail={maskEmail(email)}
                onSubmit={handleOtpSubmit}
                registerOtp={otpForm.register('otp')}
                fieldError={otpForm.formState.errors.otp?.message}
                serverError={serverError}
                isLoading={
                  state.matches('verifyingOtp') || state.matches('redirecting')
                }
                onResend={handleResend}
                isResending={state.matches('resendingOtp')}
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
