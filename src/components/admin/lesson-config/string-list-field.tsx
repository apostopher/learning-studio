import { Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Controlled add/remove editor for a string[] (key points, links). Pure — the
 * container owns the value via an RHF Controller and passes value/onChange.
 *
 * When `renderItem` is provided, each row renders the custom node instead of
 * the default text input (e.g. a rich editor for key points).
 */
export const StringListField = ({
  label,
  itemNoun,
  value,
  onChange,
  renderItem,
}: {
  label: string;
  itemNoun: string;
  value: string[];
  onChange: (next: string[]) => void;
  renderItem?: (args: {
    value: string;
    onChange: (v: string) => void;
    index: number;
  }) => ReactNode;
}) => {
  const update = (index: number, next: string) =>
    onChange(value.map((v, i) => (i === index ? next : v)));
  const remove = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-medium text-secondary text-xs uppercase tracking-wide">
        {label}
      </legend>
      {value.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: this list is controlled — value always comes from props, so index is a stable enough key for this render.
        <div key={i} className="flex items-start gap-2">
          {renderItem ? (
            <div className="flex-1">
              {renderItem({
                value: item,
                onChange: (next) => update(i, next),
                index: i,
              })}
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor={`${label}-${i}`}>
                {itemNoun} {i + 1}
              </label>
              <input
                id={`${label}-${i}`}
                value={item}
                onChange={(e) => update(i, e.target.value)}
                className="flex-1 rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
              />
            </>
          )}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${itemNoun} ${i + 1}`}
            className="rounded-md p-2 text-tertiary transition-colors hover:bg-gray-4 hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, ''])}
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add {itemNoun}
      </button>
    </fieldset>
  );
};
