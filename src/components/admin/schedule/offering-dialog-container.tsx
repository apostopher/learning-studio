import { Dialog } from '@base-ui/react/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { atom, useAtom } from 'jotai';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { scheduleDialogAtom } from '#/atoms/schedule';
import { useAdminUsers } from '#/data-hooks/use-admin-users';
import {
  useCreateOffering,
  useDeleteOffering,
  useUpdateOffering,
} from '#/data-hooks/use-offerings';
import {
  type Offering,
  type OfferingFormValues,
  type OfferingUser,
  offeringFormSchema,
} from '#/lib/offering-schemas';
import { OfferingAddPerson } from './offering-add-person';
import { OfferingForm } from './offering-form';
import { levelSummary, OfferingRosterTable } from './offering-roster-table';
import {
  endDateFromWindow,
  formatWindowSummary,
  parseDayKey,
  windowDaysBetween,
} from './offering-window';

/**
 * How long an offering runs by default, in days from the drop.
 *
 * A suggestion, not a rule. It exists so the common case is one edit rather
 * than a date typed from scratch, and because an empty window gives no clue
 * what shape of answer is wanted. 45 days is the middle of the 30-to-60 a
 * ground-school window usually runs to.
 */
const DEFAULT_WINDOW_DAYS = 45;

/** The person search term and armed row. Atoms, so the form stays hookless. */
const personQueryAtom = atom('');
const selectedPersonAtom = atom<string | null>(null);

/**
 * The dialog a drop opens, and the one a bar reopens: when does this run, and
 * who is on it.
 *
 * One dialog for both, because they ask the same questions. Which mode it is
 * in comes from `scheduleDialogAtom`; the offering being edited is resolved
 * from the list already on screen rather than refetched, since the calendar
 * behind the dialog is showing that very row.
 */
export const OfferingDialogContainer = ({
  offerings,
}: {
  offerings: Offering[];
}) => {
  const [dialog, setDialog] = useAtom(scheduleDialogAtom);
  const [personQuery, setPersonQuery] = useAtom(personQueryAtom);
  const [selectedPerson, setSelectedPerson] = useAtom(selectedPersonAtom);
  const create = useCreateOffering();
  const update = useUpdateOffering();
  const remove = useDeleteOffering();
  const directory = useAdminUsers();

  const editing =
    dialog?.mode === 'edit'
      ? (offerings.find((row) => row.id === dialog.offeringId) ?? null)
      : null;

  const courseName =
    dialog?.mode === 'create' ? dialog.courseName : (editing?.courseName ?? '');
  const courseId =
    dialog?.mode === 'create' ? dialog.courseId : (editing?.courseId ?? null);
  const seedStartsOn =
    dialog?.mode === 'create' ? dialog.startsOn : (editing?.startsOn ?? '');
  const seedEndsOn =
    dialog?.mode === 'create'
      ? (endDateFromWindow(dialog.startsOn, DEFAULT_WINDOW_DAYS) ?? '')
      : (editing?.endsOn ?? '');

  const form = useForm<OfferingFormValues>({
    resolver: zodResolver(offeringFormSchema),
    mode: 'onSubmit',
    defaultValues: { startsOn: '', endsOn: '', users: [] },
    // Seeded by RHF rather than by an effect (docs/use-effect-rules.md). The
    // dialog is mounted once and re-pointed at whatever was dropped or
    // clicked, so `defaultValues` alone would only ever describe the first
    // one. `keepDirtyValues` protects fields already edited from a background
    // refetch of the offerings list underneath them.
    values: dialog
      ? {
          startsOn: seedStartsOn,
          endsOn: seedEndsOn,
          users: editing?.users ?? [],
        }
      : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const startsOn = form.watch('startsOn');
  const endsOn = form.watch('endsOn');
  const users = form.watch('users');
  const isSaving = create.isPending || update.isPending || remove.isPending;

  const windowDays = windowDaysBetween(startsOn, endsOn);

  const close = () => {
    setDialog(null);
    form.reset({ startsOn: '', endsOn: '', users: [] });
    setPersonQuery('');
    setSelectedPerson(null);
    create.reset();
    update.reset();
    remove.reset();
  };

  /**
   * Moving the start keeps the run's LENGTH, not its end date.
   *
   * Rescheduling a 45-day intake a week later means 45 days from the new
   * start — not 38 days ending where it used to. Holding the end fixed would
   * silently shorten every run that gets moved.
   */
  const handleStartsOnChange = (next: string) => {
    form.setValue('startsOn', next, { shouldDirty: true });
    const shifted =
      windowDays === null ? null : endDateFromWindow(next, windowDays);
    if (shifted) form.setValue('endsOn', shifted, { shouldDirty: true });
  };

  const handleWindowDaysChange = (next: string) => {
    const days = Number(next);
    if (next === '' || !Number.isInteger(days) || days < 1) return;
    const shifted = endDateFromWindow(startsOn, days);
    if (shifted) form.setValue('endsOn', shifted, { shouldDirty: true });
  };

  // Everyone not already on this offering, matched against the search. Filtered
  // in the browser: the admin users list is already loaded and cached, and one
  // request already made beats a second one per keystroke.
  const onRoster = new Set(users.map((person) => person.userId));
  const term = personQuery.trim().toLowerCase();
  const results: OfferingUser[] = (directory.data?.users ?? [])
    .filter((user) => !onRoster.has(user.userId))
    .map((user) => ({
      userId: user.userId,
      name:
        [user.firstName, user.lastName]
          .filter((part): part is string => Boolean(part?.trim()))
          .join(' ') || user.email,
      email: user.email,
      level: courseId === null ? null : (user.levels[courseId] ?? null),
    }))
    .filter(
      (person) =>
        !term ||
        person.name.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term),
    )
    // Capped so a 2000-person org does not render 2000 rows into the panel.
    // The search is how you reach anyone past the cap.
    .slice(0, 25);

  const handleAdd = () => {
    const person = results.find((row) => row.userId === selectedPerson);
    if (!person) return;
    form.setValue('users', [...users, person], { shouldDirty: true });
    setSelectedPerson(null);
    setPersonQuery('');
  };

  const handleRemove = (userId: string) => {
    form.setValue(
      'users',
      users.filter((person) => person.userId !== userId),
      { shouldDirty: true },
    );
  };

  const handleSubmit = form.handleSubmit((values) => {
    const userIds = values.users.map((person) => person.userId);
    if (dialog?.mode === 'create') {
      create.mutate(
        {
          courseId: dialog.courseId,
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          userIds,
        },
        {
          onSuccess: (offering) => {
            toast.success(`${offering.courseName} scheduled`);
            close();
          },
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }
    if (!editing) return;
    update.mutate(
      {
        offeringId: editing.id,
        startsOn: values.startsOn,
        endsOn: values.endsOn,
        userIds,
      },
      {
        onSuccess: () => {
          toast.success('Offering updated');
          close();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  });

  const handleDelete = () => {
    if (!editing) return;
    remove.mutate(editing.id, {
      onSuccess: () => {
        toast.success(`${editing.courseName} unscheduled`);
        close();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const saveError =
    create.error?.message ?? update.error?.message ?? remove.error?.message;

  return (
    <Dialog.Root
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-0 m-auto h-fit max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
          {/* The course name in BOTH modes, not "Schedule this course" when
              creating. It was already printed twice — once here and once in
              the form body — and of the two the title is the one a reader
              looks at to answer "which course is this?". */}
          <Dialog.Title className="font-semibold text-accent-text text-lg">
            {courseName}
          </Dialog.Title>
          <Dialog.Description className="mt-1 mb-5 text-secondary text-sm">
            An offering is one dated run of a course. The same course can run
            again later — that is a separate offering.
          </Dialog.Description>
          <OfferingForm
            startsOn={startsOn}
            onStartsOnChange={handleStartsOnChange}
            startsOnError={form.formState.errors.startsOn?.message}
            windowDays={windowDays === null ? '' : String(windowDays)}
            onWindowDaysChange={handleWindowDaysChange}
            endsOn={endsOn}
            onEndsOnChange={(next) =>
              form.setValue('endsOn', next, { shouldDirty: true })
            }
            endsOnError={form.formState.errors.endsOn?.message}
            summaryLine={formatWindowSummary(startsOn, endsOn)}
            rosterCount={levelSummary(users)}
            addPerson={
              <OfferingAddPerson
                query={personQuery}
                onQueryChange={setPersonQuery}
                results={results}
                selectedUserId={selectedPerson}
                onSelect={setSelectedPerson}
                onAdd={handleAdd}
                disabled={isSaving}
                emptyLabel={
                  directory.isLoading
                    ? 'Loading people…'
                    : 'Nobody matches that search who is not already on this offering.'
                }
              />
            }
            rosterTable={
              <Controller
                control={form.control}
                name="users"
                render={({ field }) => (
                  <OfferingRosterTable
                    users={field.value}
                    onRemove={handleRemove}
                    disabled={isSaving}
                  />
                )}
              />
            }
            onSubmit={handleSubmit}
            onCancel={close}
            onDelete={dialog?.mode === 'edit' ? handleDelete : undefined}
            isSaving={isSaving}
            submitLabel={dialog?.mode === 'edit' ? 'Save' : 'Schedule'}
            saveError={saveError}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** Exported for the schedule grid's bar captions. */
export function formatOfferingRange(offering: Offering): string {
  const from = parseDayKey(offering.startsOn);
  const to = parseDayKey(offering.endsOn);
  if (!from || !to) return '';
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${format(from, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
}
