import { Combobox } from '@base-ui/react/combobox';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { AdminDiscipline } from '#/data-hooks/use-disciplines';
import { roleDisplayName } from '#/lib/role-labels';

export interface PersonOption {
  userId: string;
  /** What the picker shows and searches — name plus email, or email alone. */
  label: string;
}

export interface DisciplinesPanelProps {
  disciplines: AdminDiscipline[];
  /** Lessons filed under no discipline at all. */
  unfiledLessonCount: number;
  isLoading: boolean;
  /** A failure that belongs to the page as a whole (the listing itself). */
  errorMessage?: string;

  newName: string;
  onNewNameChange: (name: string) => void;
  onCreate: () => void;

  renamingId: number | null;
  renameDraft: string;
  onRenameDraftChange: (name: string) => void;
  onStartRename: (discipline: AdminDiscipline) => void;
  onCancelRename: () => void;
  onSubmitRename: () => void;

  addingExpertToId: number | null;
  onStartAddExpert: (disciplineId: number) => void;
  onCancelAddExpert: () => void;
  candidateQuery: string;
  onCandidateQueryChange: (query: string) => void;
  candidates: PersonOption[];
  /** What the picker says when it has nothing to offer, and why. */
  candidatesEmptyLabel: string;
  selectedUserId: string | null;
  onSelectedUserIdChange: (userId: string | null) => void;
  onGrant: () => void;
  onRevoke: (disciplineId: number, userId: string) => void;

  pendingDeleteId: number | null;
  onRequestDelete: (disciplineId: number) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;

  isSaving: boolean;
  /** A failure that belongs to one row, so it can be shown beside it. */
  rowError: { disciplineId: number; message: string } | null;
}

function memberName(member: AdminDiscipline['staff'][number]): string {
  const name = [member.firstName, member.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name || member.email;
}

function lessonPhrase(count: number): string {
  return `${count} ${count === 1 ? 'lesson' : 'lessons'}`;
}

/**
 * The org's disciplines, each with its lesson count and its subject experts.
 *
 * Pure and hookless — the container owns every piece of state, which is why
 * the person picker is fully controlled rather than using Base UI's
 * `defaultValue`.
 *
 * Every refusal on this screen states its reason twice: once in text the eye
 * reaches and once in the control's accessible name. The one that matters most
 * is Delete, which is locked for any discipline still holding lessons —
 * `lessons.discipline_id` is `on delete no action`, so the database would
 * refuse it anyway, and a button that fails on click without saying why is
 * worse than one that says why before it is pressed. The server refuses it
 * independently with the same count (see `deleteDisciplineHandler`); this is
 * the explanation, not the enforcement.
 */
export const DisciplinesPanel = ({
  disciplines,
  unfiledLessonCount,
  isLoading,
  errorMessage,
  newName,
  onNewNameChange,
  onCreate,
  renamingId,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  addingExpertToId,
  onStartAddExpert,
  onCancelAddExpert,
  candidateQuery,
  onCandidateQueryChange,
  candidates,
  candidatesEmptyLabel,
  selectedUserId,
  onSelectedUserIdChange,
  onGrant,
  onRevoke,
  pendingDeleteId,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  isSaving,
  rowError,
}: DisciplinesPanelProps) => {
  const labelByUserId = new Map(candidates.map((p) => [p.userId, p.label]));
  const personIds = candidates.map((p) => p.userId);
  const expertLabel = roleDisplayName('subject-expert');

  return (
    <div className="content-grid overflow-y-auto py-8">
      <div className="content flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-primary text-xl">Disciplines</h1>
          <p className="max-w-prose text-secondary text-sm">
            A lesson's discipline decides who may edit it. Only a {expertLabel}{' '}
            assigned here can change a lesson filed under that discipline —
            appointing them is an admin's job, not theirs.
          </p>
          <p className="text-secondary text-sm">
            {unfiledLessonCount === 0 ? (
              <>Every lesson in the library is filed under a discipline.</>
            ) : (
              <>
                <strong className="font-semibold text-primary">
                  {lessonPhrase(unfiledLessonCount)}
                </strong>{' '}
                {unfiledLessonCount === 1 ? 'is' : 'are'} filed under no
                discipline. Only an admin can edit{' '}
                {unfiledLessonCount === 1 ? 'it' : 'them'} until{' '}
                {unfiledLessonCount === 1 ? 'it is' : 'they are'} moved into one
                in the knowledge library.
              </>
            )}
          </p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-6 bg-gray-2 p-4"
        >
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <label
              htmlFor="new-discipline-name"
              className="font-medium text-primary text-sm"
            >
              New discipline
            </label>
            <input
              id="new-discipline-name"
              value={newName}
              onChange={(event) => onNewNameChange(event.target.value)}
              disabled={isSaving}
              placeholder="e.g. Aerodynamics"
              className="rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={isSaving || newName.trim() === ''}
            aria-label={
              newName.trim() === ''
                ? 'Create discipline — type a name first'
                : 'Create discipline'
            }
            className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Create
          </button>
          {newName.trim() === '' && (
            <p className="w-full text-secondary text-xs">
              Type a name to create a discipline.
            </p>
          )}
        </form>

        {errorMessage && (
          <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="flex items-center gap-2 text-secondary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading disciplines…
          </p>
        ) : disciplines.length === 0 ? (
          <p className="text-secondary text-sm">
            No disciplines yet. Every lesson stays admin-only until one exists
            and a {expertLabel} is assigned to it.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {disciplines.map((discipline) => {
              const locked = discipline.lessonCount > 0;
              const deleteReason = locked
                ? `Cannot delete ${discipline.name}: it still holds ${lessonPhrase(discipline.lessonCount)}. Move them to another discipline in the knowledge library first.`
                : `Delete ${discipline.name}`;
              const isRenaming = renamingId === discipline.id;
              const isAddingExpert = addingExpertToId === discipline.id;
              const isConfirmingDelete = pendingDeleteId === discipline.id;

              return (
                <li
                  key={discipline.id}
                  className="flex flex-col gap-3 rounded-xl border border-gray-6 bg-gray-2 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {isRenaming ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          onSubmitRename();
                        }}
                        className="flex flex-1 flex-wrap items-center gap-2"
                      >
                        <input
                          value={renameDraft}
                          onChange={(event) =>
                            onRenameDraftChange(event.target.value)
                          }
                          aria-label={`Rename ${discipline.name}`}
                          disabled={isSaving}
                          className="min-w-48 flex-1 rounded-lg border border-gray-6 bg-gray-1 px-3 py-1.5 text-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={isSaving || renameDraft.trim() === ''}
                          aria-label={
                            renameDraft.trim() === ''
                              ? 'Save name — a discipline needs a name'
                              : `Save the name of ${discipline.name}`
                          }
                          className="rounded-lg bg-apple-9 px-3 py-1.5 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={onCancelRename}
                          className="rounded-lg border border-gray-6 px-3 py-1.5 text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <h2 className="truncate font-semibold text-base text-primary">
                          {discipline.name}
                        </h2>
                        <span className="shrink-0 text-tertiary text-xs">
                          {lessonPhrase(discipline.lessonCount)}
                        </span>
                      </div>
                    )}

                    {!isRenaming && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onStartRename(discipline)}
                          aria-label={`Rename ${discipline.name}`}
                          className="rounded-lg p-2 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDelete(discipline.id)}
                          disabled={locked || isSaving}
                          aria-label={deleteReason}
                          title={deleteReason}
                          className="rounded-lg p-2 text-secondary transition-colors hover:bg-gray-4 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/*
                    The visible half of the locked Delete control's reason. The
                    accessible name above carries the same sentence, so the two
                    can never say different things.
                  */}
                  {locked && (
                    <p className="text-secondary text-xs">
                      Delete is locked: this discipline still holds{' '}
                      {lessonPhrase(discipline.lessonCount)}. Move them to
                      another discipline in the knowledge library first.
                    </p>
                  )}

                  {isConfirmingDelete && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-error-muted bg-error-subtle px-3 py-2">
                      <p className="flex-1 text-error-text text-sm">
                        Delete {discipline.name}? Its{' '}
                        {discipline.staff.length === 1
                          ? '1 subject expert loses'
                          : `${discipline.staff.length} subject experts lose`}{' '}
                        authority over it. This cannot be undone.
                      </p>
                      <button
                        type="button"
                        onClick={onConfirmDelete}
                        disabled={isSaving}
                        className="rounded-lg bg-error-9 px-3 py-1.5 font-medium text-black text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={onCancelDelete}
                        className="rounded-lg border border-gray-6 bg-gray-1 px-3 py-1.5 text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                      >
                        Keep it
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <h3 className="font-medium text-secondary text-xs uppercase tracking-wide">
                      {expertLabel}s
                    </h3>
                    {discipline.staff.length === 0 ? (
                      <p className="text-secondary text-sm">
                        No {expertLabel} yet — nobody but an admin can edit
                        these lessons.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {discipline.staff.map((member) => {
                          const name = memberName(member);
                          return (
                            <li
                              key={member.userId}
                              className="flex items-center gap-1 rounded-lg border border-gray-6 bg-gray-1 py-1 ps-3 pe-1 text-primary text-sm"
                            >
                              <span className="truncate">{name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  onRevoke(discipline.id, member.userId)
                                }
                                disabled={isSaving}
                                aria-label={`Remove ${name} as ${expertLabel} of ${discipline.name}`}
                                className="rounded p-1 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:pointer-events-none disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {isAddingExpert ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          onGrant();
                        }}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Combobox.Root
                          items={personIds}
                          value={selectedUserId}
                          onValueChange={(next) =>
                            onSelectedUserIdChange(next as string | null)
                          }
                          itemToStringLabel={(userId: string) =>
                            labelByUserId.get(userId) ?? userId
                          }
                          // The list is already the answer to `candidateQuery`
                          // — the search ran on the server. Filtering it again
                          // here would drop matches whose stored name differs
                          // from the label.
                          filter={null}
                          inputValue={candidateQuery}
                          onInputValueChange={onCandidateQueryChange}
                          disabled={isSaving}
                        >
                          {/*
                            No <Combobox.Label>: it only associates with
                            <Combobox.Trigger>, and this picker's form control
                            is <Combobox.Input> directly. The accessible name
                            goes on the input.
                          */}
                          <Combobox.Input
                            aria-label={`Person to make ${expertLabel} of ${discipline.name}`}
                            placeholder="Search by name or email"
                            className="min-w-56 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                          />
                          <Combobox.Portal>
                            <Combobox.Positioner
                              sideOffset={4}
                              className="z-50"
                            >
                              <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-gray-6 bg-gray-2 py-1 shadow-lg">
                                <Combobox.Empty className="px-3 py-2 text-secondary text-sm">
                                  {candidatesEmptyLabel}
                                </Combobox.Empty>
                                <Combobox.List>
                                  {(userId: string) => (
                                    <Combobox.Item
                                      key={userId}
                                      value={userId}
                                      className="flex cursor-default items-center gap-2 px-3 py-2 text-primary text-sm data-highlighted:bg-gray-4"
                                    >
                                      <Combobox.ItemIndicator>
                                        <Check
                                          className="h-3.5 w-3.5"
                                          aria-hidden="true"
                                        />
                                      </Combobox.ItemIndicator>
                                      <span>
                                        {labelByUserId.get(userId) ?? userId}
                                      </span>
                                    </Combobox.Item>
                                  )}
                                </Combobox.List>
                              </Combobox.Popup>
                            </Combobox.Positioner>
                          </Combobox.Portal>
                        </Combobox.Root>
                        <button
                          type="submit"
                          disabled={isSaving || selectedUserId === null}
                          aria-label={
                            selectedUserId === null
                              ? `Add ${expertLabel} — choose a person first`
                              : `Add ${expertLabel} to ${discipline.name}`
                          }
                          className="rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={onCancelAddExpert}
                          className="rounded-lg border border-gray-6 px-3 py-2 text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                        >
                          Cancel
                        </button>
                        {selectedUserId === null && (
                          <p className="w-full text-secondary text-xs">
                            Choose a person before adding them.
                          </p>
                        )}
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartAddExpert(discipline.id)}
                        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-gray-6 px-3 py-1.5 text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add {expertLabel}
                      </button>
                    )}
                  </div>

                  {rowError?.disciplineId === discipline.id && (
                    <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
                      {rowError.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
