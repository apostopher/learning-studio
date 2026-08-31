import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom, useSetAtom } from 'jotai';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  createDisciplineDialogOpenAtom,
  disciplineExpertQueryAtom,
} from '#/atoms/admin';
import {
  DisciplineRequestError,
  useCreateDisciplineWithExperts,
} from '#/data-hooks/use-disciplines';
import {
  type CreateDisciplineFormValues,
  createDisciplineFormSchema,
  type DisciplineExpertPick,
} from '#/lib/discipline-schemas';
import { CreateDisciplineForm } from './create-discipline-form';
import { DisciplineExpertPickerContainer } from './discipline-expert-picker-container';
import { PaneActionButton } from './pane-action-button';

const EXPERTS_FIELD_ID = 'create-discipline-experts';
const EMPTY_FORM: CreateDisciplineFormValues = { name: '', experts: [] };

/** "Ann", "Ann and Bob", "Ann, Bob and Cara". */
function nameList(people: DisciplineExpertPick[]): string {
  const labels = people.map((person) => person.label);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * "Add discipline", and the dialog behind it: name the discipline, optionally
 * appoint its subject experts, create.
 *
 * The trigger lives here rather than in the library header so that the header
 * stays presentational — it is handed this whole container as a node.
 *
 * Two refusals get different treatment on purpose. A duplicate name (409) is
 * attached to the name FIELD, because that is the input the user must change;
 * anything else is a form-level message. And a partial success — the
 * discipline created, some grant refused — closes the dialog and says so in a
 * toast, because resubmitting the same form would now hit the duplicate-name
 * refusal for a discipline that already exists.
 */
export const CreateDisciplineDialogContainer = ({
  canAppointExperts,
}: {
  /**
   * Whether this actor may also staff the new discipline. Admin-only: both
   * the candidate search and the grant are `requireAdmin`. RBAC rule 1 lets a
   * course manager or subject expert CREATE a discipline, and creation alone
   * is what they get — which is what stops creating one from being a back door
   * to authoring authority over it.
   */
  canAppointExperts: boolean;
}) => {
  const [open, setOpen] = useAtom(createDisciplineDialogOpenAtom);
  const setExpertQuery = useSetAtom(disciplineExpertQueryAtom);
  const create = useCreateDisciplineWithExperts();
  const form = useForm<CreateDisciplineFormValues>({
    resolver: zodResolver(createDisciplineFormSchema),
    mode: 'onSubmit',
    defaultValues: EMPTY_FORM,
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      form.reset(EMPTY_FORM);
      create.reset();
      // The search term is the picker's, not the form's, so `form.reset` does
      // not touch it — reopening would otherwise show the last search.
      setExpertQuery('');
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: ({ discipline, failedExperts }) => {
        if (failedExperts.length > 0) {
          toast.error(
            `“${discipline.name}” was created, but ${nameList(failedExperts)} could not be appointed. Add them from Disciplines.`,
          );
        } else {
          toast.success(`“${discipline.name}” created`);
        }
        onOpenChange(false);
      },
      onError: (error) => {
        if (
          error instanceof DisciplineRequestError &&
          error.status === 409 &&
          !form.formState.errors.name
        ) {
          form.setError('name', { type: 'server', message: error.message });
        }
      },
    });
  });

  // The name field owns the duplicate-name message, so the form-level slot
  // must not repeat it underneath.
  const serverError =
    create.isError && !form.formState.errors.name
      ? create.error instanceof DisciplineRequestError
        ? create.error.message
        : 'Could not create that discipline. Please try again.'
      : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={<PaneActionButton label="Add discipline" />} />
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          <Dialog.Title className="font-semibold text-lg text-primary">
            Add discipline
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-secondary text-sm">
            A discipline groups the lessons that belong to one subject. It
            becomes a column in the library.
          </Dialog.Description>
          <CreateDisciplineForm
            onSubmit={handleSubmit}
            registerName={form.register('name')}
            nameError={form.formState.errors.name?.message}
            expertsFieldId={EXPERTS_FIELD_ID}
            expertsField={
              !canAppointExperts ? undefined : (
                <Controller
                  control={form.control}
                  name="experts"
                  render={({ field }) => (
                    <DisciplineExpertPickerContainer
                      id={EXPERTS_FIELD_ID}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={create.isPending}
                    />
                  )}
                />
              )
            }
            serverError={serverError}
            isPending={create.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
