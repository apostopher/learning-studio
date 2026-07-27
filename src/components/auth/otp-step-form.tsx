import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '../../lib/cn';

interface OtpStepFormProps {
  maskedEmail: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerOtp: UseFormRegisterReturn<'otp'>;
  fieldError?: string;
  serverError?: string;
  isLoading: boolean;
  onResend: () => void;
  isResending: boolean;
  resendCountdown: number;
  onBack: () => void;
}

export const OtpStepForm = ({
  maskedEmail,
  onSubmit,
  registerOtp,
  fieldError,
  serverError,
  isLoading,
  onResend,
  isResending,
  resendCountdown,
  onBack,
}: OtpStepFormProps) => {
  const errorMessage = fieldError ?? serverError;
  const inputId = 'auth-otp';
  const errorId = 'auth-otp-error';
  const hintId = 'auth-otp-hint';
  const canResend = resendCountdown === 0 && !isResending && !isLoading;

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="mb-6 text-sm text-secondary">
        We sent a 6-digit code to{' '}
        <span className="font-medium text-primary">{maskedEmail}</span>
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-primary">
          Verification code
        </label>

        <input
          {...registerOtp}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          aria-describedby={`${hintId}${errorMessage ? ` ${errorId}` : ''}`}
          aria-invalid={!!errorMessage}
          className={cn(
            'w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-primary outline-none',
            'font-mono tracking-widest text-center text-lg',
            'transition-colors duration-100',
            'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
            errorMessage
              ? 'border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9'
              : 'border-gray-6 hover:border-gray-8',
          )}
        />

        <p id={hintId} className="text-xs text-secondary">
          Check your email — including spam.
        </p>

        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className={cn(
            'text-sm text-error-text transition-all duration-200',
            errorMessage
              ? 'px-3 py-2.5 rounded-[var(--radius-lg)] bg-red-9/15 border border-red-9/40'
              : 'min-h-[1.25rem]',
          )}
        >
          {errorMessage ?? ''}
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          'mt-2 w-full flex items-center justify-center gap-2',
          'rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast',
          'transition-colors duration-100',
          'hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Signing in…</span>
          </>
        ) : (
          'Sign in'
        )}
      </button>

      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-secondary hover:text-primary focus-visible:outline-none focus-visible:underline transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Use a different email
        </button>

        <button
          type="button"
          onClick={onResend}
          disabled={!canResend}
          className={cn(
            'flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:underline',
            canResend
              ? 'text-apple-9 hover:text-apple-10'
              : 'text-gray-9 cursor-not-allowed',
          )}
        >
          {isResending ? (
            <>
              <Loader2
                className="w-3.5 h-3.5 animate-spin"
                aria-hidden="true"
              />
              Sending…
            </>
          ) : resendCountdown > 0 ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Resend in {resendCountdown}s
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Resend code
            </>
          )}
        </button>
      </div>
    </form>
  );
};
