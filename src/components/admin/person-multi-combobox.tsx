import type { DisciplineExpertPick } from '#/lib/discipline-schemas';
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from './multi-select-combobox';

export interface PersonMultiComboboxProps {
  /** The input's id, so a `<label htmlFor>` can point at it. */
  id: string;
  /** People already picked, rendered as removable chips. */
  value: DisciplineExpertPick[];
  onValueChange: (next: DisciplineExpertPick[]) => void;
  /** The current search's results — already filtered by the server. */
  options: DisciplineExpertPick[];
  query: string;
  onQueryChange: (query: string) => void;
  /** What the list says when it has nothing to offer, and why. */
  emptyLabel: string;
  placeholder?: string;
  disabled?: boolean;
}

const toOption = (person: DisciplineExpertPick): MultiSelectOption => ({
  value: person.userId,
  label: person.label,
});
const toPerson = (option: MultiSelectOption): DisciplineExpertPick => ({
  userId: option.value,
  label: option.label,
});

/**
 * A people picker that holds several people at once.
 *
 * A thin adapter over `MultiSelectCombobox`, translating between that
 * component's `{ value, label }` and this domain's `{ userId, label }`. The
 * translation is the only thing here: the picker's behaviour, chips and
 * accessibility live in one place, shared with the disciplines picker.
 *
 * `serverFiltered` because the list is already the answer to `query` — the
 * search ran on the server against stored names and emails, and filtering the
 * results again against the rendered label would drop anyone whose match was
 * on a field the label does not show.
 */
export const PersonMultiCombobox = ({
  id,
  value,
  onValueChange,
  options,
  query,
  onQueryChange,
  emptyLabel,
  placeholder = 'Search by name or email',
  disabled = false,
}: PersonMultiComboboxProps) => (
  <MultiSelectCombobox
    id={id}
    value={value.map(toOption)}
    onValueChange={(next) => onValueChange(next.map(toPerson))}
    options={options.map(toOption)}
    query={query}
    onQueryChange={onQueryChange}
    serverFiltered
    emptyLabel={emptyLabel}
    placeholder={placeholder}
    disabled={disabled}
  />
);
