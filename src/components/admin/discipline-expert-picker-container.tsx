import { useAtom } from 'jotai';
import { disciplineExpertQueryAtom } from '#/atoms/admin';
import {
  staffCandidateLabel,
  useDisciplineStaffCandidates,
} from '#/data-hooks/use-disciplines';
import { STAFF_CANDIDATE_MIN_QUERY } from '#/lib/admin-schemas';
import type { DisciplineExpertPick } from '#/lib/discipline-schemas';
import { PersonMultiCombobox } from './person-multi-combobox';

/**
 * Owns the subject-expert picker's search: the term, the request it drives,
 * and the sentence the empty list shows.
 *
 * Deliberately does NOT own the selection — that is a form field, held by the
 * create-discipline form's `Controller` and handed down as `value`/`onChange`.
 * Splitting it this way is what lets the picker be reused by a form that
 * validates and submits the picks while the search itself stays throwaway.
 */
export const DisciplineExpertPickerContainer = ({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: DisciplineExpertPick[];
  onChange: (next: DisciplineExpertPick[]) => void;
  disabled?: boolean;
}) => {
  const [query, setQuery] = useAtom(disciplineExpertQueryAtom);
  const candidates = useDisciplineStaffCandidates(query);

  const found: DisciplineExpertPick[] = (candidates.data ?? []).map(
    (candidate) => ({
      userId: candidate.userId,
      label: staffCandidateLabel(candidate),
    }),
  );
  // Anyone already picked stays in the list even once the search has moved
  // off them, so the list can still deselect them and their row still shows a
  // tick. Without this, picking Ann and then searching "bob" leaves Ann
  // selectable only through her chip.
  const options = [
    ...value.filter((picked) => !found.some((f) => f.userId === picked.userId)),
    ...found,
  ];

  // Says which of the three reasons the list is empty for. "No matching
  // people" while the request is still in flight is a lie the user acts on.
  const emptyLabel =
    query.trim().length < STAFF_CANDIDATE_MIN_QUERY
      ? `Type at least ${STAFF_CANDIDATE_MIN_QUERY} characters to search`
      : candidates.isFetching
        ? 'Searching…'
        : 'No matching people';

  return (
    <PersonMultiCombobox
      id={id}
      value={value}
      onValueChange={onChange}
      options={options}
      query={query}
      onQueryChange={setQuery}
      emptyLabel={emptyLabel}
      disabled={disabled}
    />
  );
};
