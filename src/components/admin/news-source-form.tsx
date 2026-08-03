import { Loader2 } from 'lucide-react';
import type { FormEventHandler, ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface NewsSourceFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  registerName: UseFormRegisterReturn;
  registerUrl: UseFormRegisterReturn;
  registerTintColor: UseFormRegisterReturn;
  /** Current tint value, so the swatch reflects what is typed. */
  tintColor: string;
  /** The image upload control, supplied by the container. */
  imageField: ReactNode;
  nameError?: string;
  urlError?: string;
  tintColorError?: string;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}

const fieldClass =
  'w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9';

/**
 * Create/edit form for one news source. Presentational: the container owns the
 * form instance, validation and submission.
 */
export const NewsSourceForm = ({
  onSubmit,
  registerName,
  registerUrl,
  registerTintColor,
  tintColor,
  imageField,
  nameError,
  urlError,
  tintColorError,
  isPending,
  submitLabel,
  onCancel,
}: NewsSourceFormProps) => (
  <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="news-source-name"
        className="font-medium text-primary text-sm"
      >
        Name
      </label>
      <input
        {...registerName}
        id="news-source-name"
        type="text"
        maxLength={200}
        placeholder="AVweb"
        aria-invalid={nameError ? true : undefined}
        aria-describedby={nameError ? 'news-source-name-error' : undefined}
        className={fieldClass}
      />
      {nameError && (
        <p
          id="news-source-name-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {nameError}
        </p>
      )}
    </div>

    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="news-source-url"
        className="font-medium text-primary text-sm"
      >
        URL
      </label>
      <input
        {...registerUrl}
        id="news-source-url"
        type="url"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        maxLength={2048}
        placeholder="https://www.avweb.com/"
        aria-invalid={urlError ? true : undefined}
        aria-describedby={
          urlError ? 'news-source-url-error' : 'news-source-url-hint'
        }
        className={fieldClass}
      />
      {urlError ? (
        <p
          id="news-source-url-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {urlError}
        </p>
      ) : (
        <p id="news-source-url-hint" className="text-tertiary text-xs">
          The page articles are listed on. Must be publicly reachable.
        </p>
      )}
    </div>

    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-primary text-sm">Logo</span>
      {imageField}
    </div>

    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="news-source-tint"
        className="font-medium text-primary text-sm"
      >
        Tint color <span className="font-normal text-tertiary">(optional)</span>
      </label>
      <div className="flex items-center gap-2">
        {/*
          A swatch, not a color input: the value is optional, and a native
          `type="color"` cannot represent "unset" — it always shows #000000,
          which reads as a deliberate black the admin never chose.
        */}
        <span
          aria-hidden="true"
          className="h-9 w-9 shrink-0 rounded-lg border border-gray-6"
          style={{ backgroundColor: tintColorError ? undefined : tintColor }}
        />
        <input
          {...registerTintColor}
          id="news-source-tint"
          type="text"
          spellCheck={false}
          maxLength={7}
          placeholder="#1B4D3E"
          aria-invalid={tintColorError ? true : undefined}
          aria-describedby={
            tintColorError ? 'news-source-tint-error' : undefined
          }
          className={fieldClass}
        />
      </div>
      {tintColorError && (
        <p
          id="news-source-tint-error"
          role="alert"
          className="text-error-text text-sm"
        >
          {tintColorError}
        </p>
      )}
    </div>

    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="rounded-lg px-4 py-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-7 disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {submitLabel}
      </button>
    </div>
  </form>
);
