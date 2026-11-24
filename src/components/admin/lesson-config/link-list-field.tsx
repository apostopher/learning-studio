import { Plus, X } from 'lucide-react';
import { cn } from '#/lib/cn';
import type { MaterialLink } from '#/types';

const inputCls =
  'rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9';

// A <legend> is the fieldset's caption box, not a flex item, so the container's
// `gap` never applies between it and the first row — the space has to be a
// margin on the legend itself.
const legendCls =
  'font-medium text-secondary text-xs uppercase tracking-wide [margin-block-end:0.5rem]';

// Labels like "TEST THIS!" carry spaces and punctuation, which an HTML id may
// not — and two lists on one form must not share ids.
const idBaseOf = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The DOM id of a row's URL input, for moving focus to a refused one. */
export const linkUrlId = (label: string, index: number) =>
  `${idBaseOf(label)}-url-${index}`;

/**
 * Controlled add/remove editor for a MaterialLink[] — each row is a display
 * name plus a URL. Pure: the container owns the value via an RHF Controller and
 * passes value/onChange.
 */
export const LinkListField = ({
  label = 'Links',
  value,
  onChange,
  urlErrors = [],
}: {
  label?: string;
  value: MaterialLink[];
  /** What is wrong with each row's URL, by row; undefined where nothing is. */
  urlErrors?: (string | undefined)[];
  onChange: (next: MaterialLink[]) => void;
}) => {
  const update = (index: number, patch: Partial<MaterialLink>) =>
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const remove = (index: number) =>
    onChange(value.filter((_, i) => i !== index));
  const idBase = idBaseOf(label);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={legendCls}>{label}</legend>
      {value.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: this list is controlled — value always comes from props, so index is a stable enough key for this render.
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="sr-only" htmlFor={`${idBase}-name-${i}`}>
              Link {i + 1} name
            </label>
            <input
              id={`${idBase}-name-${i}`}
              value={item.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Name"
              className={inputCls}
            />
            <label className="sr-only" htmlFor={linkUrlId(label, i)}>
              Link {i + 1} URL
            </label>
            <div className="flex min-w-0 flex-col gap-1.5">
              <input
                id={linkUrlId(label, i)}
                type="url"
                inputMode="url"
                value={item.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://example.com"
                aria-invalid={urlErrors[i] ? true : undefined}
                aria-describedby={
                  urlErrors[i] ? `${linkUrlId(label, i)}-error` : undefined
                }
                className={cn(
                  inputCls,
                  urlErrors[i] && 'border-error-9 focus-visible:ring-error-9',
                )}
              />
              {urlErrors[i] && (
                <p
                  id={`${linkUrlId(label, i)}-error`}
                  role="alert"
                  className="text-error-text text-sm"
                >
                  {urlErrors[i]}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove link ${i + 1}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-gray-4 hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { name: '', url: '' }])}
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add link
      </button>
    </fieldset>
  );
};
