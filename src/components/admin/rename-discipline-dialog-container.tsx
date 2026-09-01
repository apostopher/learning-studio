import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  disciplineExpertQueryAtom,
  renameDisciplineTargetAtom,
} from '#/atoms/admin';
import {
  DisciplineRequestError,
  staffCandidateLabel,
  useDisciplines,
  useRenameDiscipline,
  useSetDisciplineExperts,
} from '#/data-hooks/use-disciplines';
import {
  type DisciplineExpertPick,
  type EditDisciplineFormValues,
  editDisciplineFormSchema,
} from '#/lib/discipline-schemas';
import { DisciplineExpertPickerContainer } from './discipline-expert-picker-container';
import { EditDisciplineForm } from './edit-discipline-form';

const EXPERTS_FIELD_ID = 'edit-discipline-experts';

/**
 * Edit the discipline named by `renameDisciplineTargetAtom`: its name, and who
 * its subject experts are.
 *
 * This is the ONLY place either is done. There was a `/admin/disciplines`
 * screen doing both; it is gone, because a discipline is a column in the
 * library and editing it two clicks from the column it describes beats a
 * separate list that shows the same rows without the lessons in them.
 *
 * Admin-only, and its two writes are guarded that way independently
 * (`requireAdmin` on the rename and on both staff writes). The button that
 * opens it is withheld from anyone else, and the server refuses regardless —
 * an SME must not be able to appoint a peer, or re-appoint themselves, on the
 * discipline they already hold.
 *
 * The roster comes from `useDisciplines`, the same admin-only listing the
 * deleted screen used. The form does NOT submit until it has loaded: an empty
 * multi-select is indistinguishable from "no experts", and saving it would
 * revoke everyone.
 */
export const RenameDisciplineDialogContainer = () => {
  const [target, setTarget] = useAtom(renameDisciplineTargetAtom);
  const setExpertQuery = useSetAtom(disciplineExpertQueryAtom);
  const rename = useRenameDiscipline();
  const setExperts = useSetDisciplineExperts();

  // Only fetched while a dialog is open — `useDisciplines` is a plain query,
  // so the listing is loaded on mount of whichever screen holds this. That is
  // the editor, whose audience is already staff.
  const listing = useDisciplines();
  const discipline = target
    ? (listing.data?.disciplines.find((d) => d.id === target.id) ?? null)
    : null;
  const currentExperts: DisciplineExpertPick[] = (discipline?.staff ?? []).map(
    (member) => ({
      userId: member.userId,
      label: staffCandidateLabel(member),
    }),
  );
  const isLoadingExperts = target !== null && discipline === null;

  const form = useForm<EditDisciplineFormValues>({
    resolver: zodResolver(editDisciplineFormSchema),
    mode: 'onSubmit',
    defaultValues: { name: '', experts: [] },
  });

  const { reset } = form;
  // Seeds the fields once the target AND its roster are both known. The form
  // is mounted once at the editor root and outlives every opening, so its
  // defaults are read long before any discipline is chosen — and the roster
  // arrives a request later than the name does.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialised roster, not the array identity, or a refetch returning equal data would reset a half-edited picker under the user
  useEffect(() => {
    if (!target || isLoadingExperts) return;
    reset({ name: target.name, experts: currentExperts });
  }, [
    target,
    isLoadingExperts,
    reset,
    currentExperts.map((e) => e.userId).join(),
  ]);

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setTarget(null);
      form.reset({ name: '', experts: [] });
      rename.reset();
      setExperts.reset();
      // The search term belongs to the picker, not the form, so `form.reset`
      // does not touch it — reopening would otherwise show the last search.
      setExpertQuery('');
    }
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!target || isLoadingExperts) return;
    try {
      if (values.name !== target.name) {
        await rename.mutateAsync({
          disciplineId: target.id,
          name: values.name,
        });
      }
      const result = await setExperts.mutateAsync({
        disciplineId: target.id,
        userIds: values.experts.map((expert) => expert.userId),
        current: currentExperts.map((expert) => expert.userId),
      });
      // Says what actually happened rather than a blanket "Saved": with two
      // writes behind one button, "nothing needed changing" and "three people
      // were removed" must not read the same.
      toast.success(
        result.added === 0 && result.removed === 0
          ? values.name !== target.name
            ? 'Discipline renamed'
            : 'No changes to save'
          : 'Discipline updated',
      );
      onOpenChange(false);
    } catch (error) {
      if (
        error instanceof DisciplineRequestError &&
        error.status === 409 &&
        !form.formState.errors.name
      ) {
        form.setError('name', { type: 'server', message: error.message });
      }
    }
  });

  const failure = rename.error ?? setExperts.error;
  const serverError =
    failure && !form.formState.errors.name
      ? failure instanceof DisciplineRequestError
        ? failure.message
        : 'Could not save that discipline. Please try again.'
      : undefined;

  return (
    <Dialog.Root open={target !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Edit discipline
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-secondary text-sm">
            The web address of every lesson under {target?.name ?? 'it'} stays
            the same — only the name shown here changes.
          </Dialog.Description>
          <EditDisciplineForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            nameError={form.formState.errors.name?.message}
            expertsFieldId={EXPERTS_FIELD_ID}
            isLoadingExperts={isLoadingExperts}
            expertsField={
              <Controller
                control={form.control}
                name="experts"
                render={({ field }) => (
                  <DisciplineExpertPickerContainer
                    id={EXPERTS_FIELD_ID}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={rename.isPending || setExperts.isPending}
                  />
                )}
              />
            }
            serverError={serverError}
            isPending={rename.isPending || setExperts.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
