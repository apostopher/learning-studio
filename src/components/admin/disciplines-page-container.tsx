import { useAtom } from 'jotai';
import {
  addingExpertToDisciplineIdAtom,
  expertCandidateQueryAtomFamily,
  expertSelectionAtomFamily,
  newDisciplineNameAtom,
  pendingDeleteDisciplineIdAtom,
  renameDisciplineDraftAtom,
  renamingDisciplineIdAtom,
} from '#/atoms/disciplines';
import {
  DisciplineRequestError,
  type DisciplineStaffCandidate,
  useCreateDiscipline,
  useDeleteDiscipline,
  useDisciplineStaffCandidates,
  useDisciplines,
  useGrantDisciplineExpert,
  useRenameDiscipline,
  useRevokeDisciplineExpert,
} from '#/data-hooks/use-disciplines';
import { STAFF_CANDIDATE_MIN_QUERY } from '#/lib/admin-schemas';
import { DisciplinesPanel, type PersonOption } from './disciplines-panel';

function personLabel(candidate: DisciplineStaffCandidate): string {
  const name = [candidate.firstName, candidate.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name ? `${name} (${candidate.email})` : candidate.email;
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof DisciplineRequestError) return error.message;
  return error ? 'Something went wrong. Try again.' : undefined;
}

/**
 * The `/admin/disciplines` screen.
 *
 * Every read and write here goes through a TanStack Query data-hook, and each
 * of the four endpoints behind them self-guards on `requireAdmin` — nothing on
 * this screen is gated client-side, because nothing on the client can be
 * trusted to gate it. The route's `beforeLoad` keeps a non-admin from seeing a
 * page they cannot use; it is not the security boundary.
 *
 * The picker's search term and selection are keyed by discipline id
 * (`atomFamily`), so opening the picker on one discipline and then another
 * cannot carry a half-finished choice across — the failure that made
 * `courseStaffSelectedPersonAtomFamily` a family.
 */
export const DisciplinesPageContainer = () => {
  const [newName, setNewName] = useAtom(newDisciplineNameAtom);
  const [renamingId, setRenamingId] = useAtom(renamingDisciplineIdAtom);
  const [renameDraft, setRenameDraft] = useAtom(renameDisciplineDraftAtom);
  const [addingExpertToId, setAddingExpertToId] = useAtom(
    addingExpertToDisciplineIdAtom,
  );
  const [pendingDeleteId, setPendingDeleteId] = useAtom(
    pendingDeleteDisciplineIdAtom,
  );

  // Keyed by the discipline whose picker is open. `-1` is the no-picker-open
  // cell: discipline ids are positive serials, so it can never collide with a
  // real one, and hooks cannot be called conditionally.
  const pickerKey = addingExpertToId ?? -1;
  const [candidateQuery, setCandidateQuery] = useAtom(
    expertCandidateQueryAtomFamily(pickerKey),
  );
  const [selectedPerson, setSelectedPerson] = useAtom(
    expertSelectionAtomFamily(pickerKey),
  );

  const listing = useDisciplines();
  const candidates = useDisciplineStaffCandidates(candidateQuery);
  const create = useCreateDiscipline();
  const rename = useRenameDiscipline();
  const remove = useDeleteDiscipline();
  const grant = useGrantDisciplineExpert();
  const revoke = useRevokeDisciplineExpert();

  const found: PersonOption[] = (candidates.data ?? []).map((candidate) => ({
    userId: candidate.userId,
    label: personLabel(candidate),
  }));
  // The picked person stays in the list once the search has moved off them, so
  // the closed picker keeps showing a name rather than a raw user id.
  const people =
    selectedPerson && !found.some((p) => p.userId === selectedPerson.userId)
      ? [selectedPerson, ...found]
      : found;

  const candidatesEmptyLabel =
    candidateQuery.trim().length < STAFF_CANDIDATE_MIN_QUERY
      ? `Type at least ${STAFF_CANDIDATE_MIN_QUERY} characters to search`
      : candidates.isFetching
        ? 'Searching…'
        : 'No matching people';

  /**
   * Which row a failed write belongs to, taken from the mutation's own
   * `variables` rather than a separate atom recording "the row I last acted
   * on". The variables ARE what the request was made with, so the message can
   * never end up beside a row the request never touched.
   */
  const rowError = rename.error
    ? {
        disciplineId: rename.variables.disciplineId,
        message: messageOf(rename.error) ?? '',
      }
    : remove.error
      ? {
          disciplineId: remove.variables,
          message: messageOf(remove.error) ?? '',
        }
      : grant.error
        ? {
            disciplineId: grant.variables.disciplineId,
            message: messageOf(grant.error) ?? '',
          }
        : revoke.error
          ? {
              disciplineId: revoke.variables.disciplineId,
              message: messageOf(revoke.error) ?? '',
            }
          : null;

  return (
    <DisciplinesPanel
      disciplines={listing.data?.disciplines ?? []}
      unfiledLessonCount={listing.data?.unfiledLessonCount ?? 0}
      isLoading={listing.isLoading}
      errorMessage={messageOf(listing.error) ?? messageOf(create.error)}
      newName={newName}
      onNewNameChange={setNewName}
      onCreate={() => {
        const name = newName.trim();
        if (name === '') return;
        create.mutate(name, { onSuccess: () => setNewName('') });
      }}
      renamingId={renamingId}
      renameDraft={renameDraft}
      onRenameDraftChange={setRenameDraft}
      onStartRename={(discipline) => {
        setRenamingId(discipline.id);
        setRenameDraft(discipline.name);
      }}
      onCancelRename={() => setRenamingId(null)}
      onSubmitRename={() => {
        const name = renameDraft.trim();
        if (renamingId === null || name === '') return;
        rename.mutate(
          { disciplineId: renamingId, name },
          { onSuccess: () => setRenamingId(null) },
        );
      }}
      addingExpertToId={addingExpertToId}
      onStartAddExpert={setAddingExpertToId}
      onCancelAddExpert={() => setAddingExpertToId(null)}
      candidateQuery={candidateQuery}
      onCandidateQueryChange={setCandidateQuery}
      candidates={people}
      candidatesEmptyLabel={candidatesEmptyLabel}
      selectedUserId={selectedPerson?.userId ?? null}
      onSelectedUserIdChange={(userId) =>
        setSelectedPerson(people.find((p) => p.userId === userId) ?? null)
      }
      onGrant={() => {
        if (addingExpertToId === null || !selectedPerson) return;
        grant.mutate(
          { disciplineId: addingExpertToId, userId: selectedPerson.userId },
          {
            onSuccess: () => {
              setSelectedPerson(null);
              setCandidateQuery('');
              setAddingExpertToId(null);
            },
          },
        );
      }}
      onRevoke={(disciplineId, userId) =>
        revoke.mutate({ disciplineId, userId })
      }
      pendingDeleteId={pendingDeleteId}
      onRequestDelete={setPendingDeleteId}
      onCancelDelete={() => setPendingDeleteId(null)}
      onConfirmDelete={() => {
        if (pendingDeleteId === null) return;
        remove.mutate(pendingDeleteId, {
          onSuccess: () => setPendingDeleteId(null),
        });
      }}
      isSaving={
        create.isPending ||
        rename.isPending ||
        remove.isPending ||
        grant.isPending ||
        revoke.isPending
      }
      rowError={rowError}
    />
  );
};
