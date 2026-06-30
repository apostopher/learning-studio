import { Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../lib/cn";

interface EmailStepFormProps {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  registerEmail: UseFormRegisterReturn<"email">;
  fieldError?: string;
  serverError?: string;
  isLoading: boolean;
}

export const EmailStepForm = ({
  onSubmit,
  registerEmail,
  fieldError,
  serverError,
  isLoading,
}: EmailStepFormProps) => {
  const errorMessage = fieldError ?? serverError;
  const inputId = "auth-email";
  const errorId = "auth-email-error";

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-12">
          Email address
        </label>

        <input
          {...registerEmail}
          id={inputId}
          type="email"
          autoComplete="email"
          autoFocus
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={!!errorMessage}
          className={cn(
            "w-full rounded-lg border bg-gray-1 px-3.5 py-2.5 text-sm text-gray-12 outline-none",
            "placeholder:text-gray-8",
            "transition-colors duration-100",
            "focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9",
            errorMessage
              ? "border-red-9 focus-visible:ring-red-9 focus-visible:border-red-9"
              : "border-gray-6 hover:border-gray-8",
          )}
        />

        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className={cn(
            "text-sm text-red-11 transition-all duration-200",
            errorMessage
              ? "px-3 py-2.5 rounded-[var(--radius-lg)] bg-red-3/70 border border-red-6/50"
              : "min-h-[1.25rem]",
          )}
        >
          {errorMessage ?? ""}
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          "mt-2 w-full flex items-center justify-center gap-2",
          "rounded-lg bg-apple-9 px-4 py-2.5 text-sm font-medium text-apple-contrast",
          "transition-colors duration-100",
          "hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Sending code…</span>
          </>
        ) : (
          "Continue"
        )}
      </button>
    </form>
  );
};
