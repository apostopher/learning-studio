import { Select } from '@base-ui/react/select';
import { CheckCircle2, ChevronDown, Loader2, Plus } from 'lucide-react';
import type { FormEventHandler } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { cn } from '#/lib/cn';
import type { AlternateLang } from '#/lib/video-languages';

interface AlternateVideoFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** `null` once every supported language is attached. */
  lang: AlternateLang | null;
  langOptions: { code: AlternateLang; label: string }[];
  onLangChange: (code: AlternateLang) => void;
  registerUrl: UseFormRegisterReturn<'url'>;
  urlError?: string;
  /** Provider label (e.g. "Mux") once `detectVideoUrl` matches the current value, else null. */
  detectedLabel: string | null;
  /** True once the field has a non-empty value that no provider recognizes. */
  showUnsupported: boolean;
  isPending: boolean;
  serverError?: string;
}

/**
 * Language + URL/ID, saved on Add. The URL feedback mirrors VideoUrlForm's
 * so the same paste (share link, editor link, bare ID) behaves the same.
 * Pure — props in, JSX out, no hooks — the container owns the draft.
 */
export const AlternateVideoForm = ({
  onSubmit,
  lang,
  langOptions,
  onLangChange,
  registerUrl,
  urlError,
  detectedLabel,
  showUnsupported,
  isPending,
  serverError,
}: AlternateVideoFormProps) => {
  // One alert markup for both branches: an add that failed just before the
  // last language was taken must still be visible after the list refetches.
  const serverAlert = serverError && (
    <p
      role="alert"
      className="rounded-lg border border-error-9/40 bg-error-9/15 px-3 py-2.5 text-error-text text-sm"
    >
      {serverError}
    </p>
  );
  if (lang === null) {
    // Visible text, not a disabled form: the reason is real content so it
    // reaches assistive tech the same way it reaches sighted users.
    return (
      <div className="flex flex-col gap-2">
        <p className="text-tertiary text-sm">
          Every supported language is attached. Remove one to replace its video.
        </p>
        {serverAlert}
      </div>
    );
  }
  const current = langOptions.find((o) => o.code === lang) ?? langOptions[0];
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Select.Root
          value={lang}
          onValueChange={(v) => onLangChange(v as AlternateLang)}
          disabled={isPending}
        >
          <Select.Trigger
            aria-label="Language"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-3 text-primary text-sm transition-colors hover:border-gray-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60 sm:w-48"
          >
            <Select.Value>{() => current.label}</Select.Value>
            <Select.Icon className="ms-auto">
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={4} className="z-50">
              <Select.Popup className="max-h-72 overflow-auto rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
                {langOptions.map((o) => (
                  <Select.Item
                    key={o.code}
                    value={o.code}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                  >
                    <Select.ItemText>{o.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            {...registerUrl}
            id="alternate-video-url"
            type="text"
            autoComplete="off"
            placeholder="Paste the translated video's URL or ID"
            aria-label="Translated video URL or ID"
            aria-invalid={!!urlError}
            aria-describedby="alternate-video-url-hint"
            className={cn(
              'h-10 min-w-0 w-full rounded-lg border bg-gray-1 px-3.5 text-sm text-primary outline-none transition-colors duration-100 placeholder:text-tertiary',
              'focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:border-apple-9',
              urlError
                ? 'border-error-9 focus-visible:ring-error-9 focus-visible:border-error-9'
                : 'border-gray-6 hover:border-gray-8',
            )}
          />
          {urlError ? (
            <p
              id="alternate-video-url-hint"
              role="alert"
              className="text-error-text text-sm"
            >
              {urlError}
            </p>
          ) : detectedLabel ? (
            <p
              id="alternate-video-url-hint"
              aria-live="polite"
              // The measured `-text` token, never a raw step: success-11 is
              // tuned for 4.5:1 and this product's floor is AAA.
              className="flex items-center gap-1.5 text-sm text-success-text"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Detected: {detectedLabel}
            </p>
          ) : showUnsupported ? (
            <p
              id="alternate-video-url-hint"
              aria-live="polite"
              className="text-error-text text-sm"
            >
              Unsupported URL — paste a Mux playback URL/ID or a Synthesia
              link/ID.
            </p>
          ) : (
            <p id="alternate-video-url-hint" className="text-tertiary text-sm">
              The same video, in {current.label}.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!detectedLabel || isPending}
          className={cn(
            'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 font-medium text-apple-contrast text-sm',
            'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          Add language
        </button>
      </div>
      {serverAlert}
    </form>
  );
};
