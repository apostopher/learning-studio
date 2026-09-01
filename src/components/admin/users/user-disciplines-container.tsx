import { useAtom } from 'jotai';
import { toast } from 'sonner';

import { userDisciplinePicksAtom } from '#/atoms/admin';
import {
  useDisciplines,
  useSetUserDisciplines,
} from '#/data-hooks/use-disciplines';
import {
  MultiSelectCombobox,
  type MultiSelectOption,
} from '../multi-select-combobox';

export const USER_DISCIPLINES_FIELD_ID = 'user-disciplines';

/**
 * Which disciplines this person is a subject expert of.
 *
 * The other side of the discipline/expert relationship from the editor's
 * "Edit discipline" dialog: that one asks "who are this discipline's experts",
 * this one asks "which disciplines is this person an expert of". Same table,
 * same two endpoints, opposite direction — which side you reach for is only a
 * question of what the screen is already showing.
 *
 * The current set is DERIVED from the discipline listing rather than fetched
 * per user: the listing already ships every discipline's roster, so the answer
 * is a filter over data this screen can have for free. There is no per-user
 * endpoint to add.
 *
 * The picks are held in an atom rather than submitted per change, so the
 * combobox can be edited freely and saved once — several grants and
 * revocations are one intent, not one per chip.
 */
export const UserDisciplinesContainer = ({ userId }: { userId: string }) => {
  const listing = useDisciplines();
  const save = useSetUserDisciplines();
  const [draft, setDraft] = useAtom(userDisciplinePicksAtom);

  const disciplines = listing.data?.disciplines ?? [];
  const options: MultiSelectOption[] = disciplines.map((discipline) => ({
    value: String(discipline.id),
    label: discipline.name,
  }));
  /** What the server says today — the baseline every diff is taken against. */
  const current = disciplines
    .filter((discipline) =>
      discipline.staff.some((member) => member.userId === userId),
    )
    .map((discipline) => discipline.id);

  // `null` means "not edited yet", which is what lets the picker show the
  // server's answer without an effect copying it into state — and lets a
  // deliberate empty selection stay empty rather than snapping back.
  const value =
    draft ?? options.filter((option) => current.includes(Number(option.value)));

  const isDirty =
    draft !== null &&
    (draft.length !== current.length ||
      draft.some((option) => !current.includes(Number(option.value))));

  const emptyLabel = listing.isLoading
    ? 'Loading disciplines…'
    : disciplines.length === 0
      ? 'No disciplines exist yet — create one in the knowledge library.'
      : 'No matching disciplines';

  return (
    <div className="flex flex-col gap-2">
      <MultiSelectCombobox
        id={USER_DISCIPLINES_FIELD_ID}
        value={value}
        onValueChange={setDraft}
        options={options}
        emptyLabel={emptyLabel}
        placeholder="Search disciplines"
        disabled={listing.isLoading || save.isPending}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-secondary text-xs">
          A subject expert may edit the content of every lesson filed under the
          disciplines listed here.
        </p>
        <button
          type="button"
          // Inert until something actually differs from the server, so the
          // button cannot issue a run of zero grants and report success.
          disabled={!isDirty || save.isPending}
          onClick={() =>
            save.mutate(
              {
                userId,
                disciplineIds: value.map((option) => Number(option.value)),
                current,
              },
              {
                onSuccess: ({ added, removed }) => {
                  toast.success(
                    `Disciplines updated — ${added} added, ${removed} removed.`,
                  );
                  setDraft(null);
                },
                onError: (error) => toast.error(error.message),
              },
            )
          }
          className="shrink-0 whitespace-nowrap rounded-lg bg-apple-9 px-3 py-1.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save disciplines
        </button>
      </div>
    </div>
  );
};
