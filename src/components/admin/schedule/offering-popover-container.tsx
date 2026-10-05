import { Popover } from '@base-ui/react/popover';
import { zodResolver } from '@hookform/resolvers/zod';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  dispatchOfferingPopoverAtom,
  offeringPopoverAnchorAtom,
  offeringPopoverAtom,
} from '#/atoms/schedule';
import { useAdminUsers } from '#/data-hooks/use-admin-users';
import {
  useCreateOffering,
  useDeleteOffering,
  useUpdateOffering,
} from '#/data-hooks/use-offerings';
import { cn } from '#/lib/cn';
import {
  type Offering,
  type OfferingFormValues,
  type OfferingUser,
  offeringFormSchema,
} from '#/lib/offering-schemas';
import { OfferingAddPerson } from './offering-add-person';
import { OfferingDiscardConfirm } from './offering-discard-confirm';
import { OfferingForm } from './offering-form';
import { OfferingPopoverPositionerContainer } from './offering-popover-positioner-container';
import { levelSummary, OfferingRosterTable } from './offering-roster-table';
import {
  endDateFromWindow,
  formatWindowSummary,
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
 * The pinned popover's first field. The page focuses it right after a pin —
 * Base UI's `initialFocus` only runs on open, and a preview → pinned change
 * is not an open. A module ref is fine: the popover is a singleton.
 */
export const offeringPopoverFirstField: { current: HTMLInputElement | null } = {
  current: null,
};

/**
 * The popover a bar's hover previews and its click pins, and that a drop
 * opens already pinned: when does this run, and who is on it.
 *
 * One popover for every entry, because they ask the same questions. Which
 * mode it is in comes from `offeringPopoverAtom`; the offering being edited is
 * resolved from the list already on screen rather than refetched, since the
 * calendar behind the popover is showing that very row.
 */
export const OfferingPopoverContainer = ({
  offerings,
}: {
  offerings: Offering[];
}) => {
  const popover = useAtomValue(offeringPopoverAtom);
  const dispatch = useSetAtom(dispatchOfferingPopoverAtom);
  const anchor = useAtomValue(offeringPopoverAnchorAtom);

  // The old dialog's two modes, read from whichever state is showing. A preview
  // is always an existing offering — you can only hover what is on the calendar.
  const dialog =
    popover.status === 'preview'
      ? ({ mode: 'edit', offeringId: popover.offeringId } as const)
      : popover.status === 'pinned'
        ? popover.target
        : null;
  const isPinned = popover.status === 'pinned';
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

  // Every exit from pinned runs through here, so the form is always reset
  // before a later preview of another offering — `keepDirtyValues` below would
  // otherwise carry a pinned A's edits into B. A preview is never dirty: inert.
  const close = () => {
    dispatch({ type: 'close' });
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

  const isDirty = form.formState.isDirty;

  return (
    <Popover.Root
      open={dialog !== null}
      onOpenChange={(open, details) => {
        if (open) return;
        // Only dismissals reach here — this popover has no Trigger, so Base UI
        // never asks to open it. Every exit path goes through the reducer.
        if (
          details.reason === 'escape-key' ||
          details.reason === 'outside-press'
        ) {
          // A clean pinned popover closes through `close` so the form and the
          // mutations reset; everything else (preview, or a dirty pin that
          // must ask first) is the reducer's call.
          if (popover.status === 'pinned' && !isDirty) close();
          else
            dispatch({
              type: 'dismiss',
              reason: details.reason === 'escape-key' ? 'escape' : 'outside',
              dirty: isDirty,
            });
        }
      }}
    >
      <Popover.Portal>
        <OfferingPopoverPositionerContainer>
          <Popover.Popup
            // A preview must not take focus from the bar the keyboard is on;
            // pinning moves focus itself (see `pinAndFocus` in the page).
            initialFocus={false}
            // Back to the segment the popover came from when it was pinned
            // from the keyboard; for a mouse or a drop there is nothing to
            // return to.
            finalFocus={() =>
              anchor &&
              anchor.kind !== 'rect' &&
              anchor.element instanceof HTMLElement
                ? anchor.element
                : false
            }
            // A preview is a picture of the offering, not a form: inert
            // removes it from the tab order and the accessibility tree, and
            // pointer-events-none keeps a cursor that catches up with it from
            // hovering its controls.
            inert={!isPinned || undefined}
            className={cn(
              'offering-popover flex max-h-[var(--available-height)] w-[min(34rem,calc(100vw-2rem))] flex-col overflow-y-auto overscroll-contain rounded-xl border border-gray-6 bg-gray-2 p-5 shadow-xl',
              !isPinned && 'pointer-events-none',
            )}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <Popover.Title className="font-semibold text-accent-text text-lg">
                {courseName}
              </Popover.Title>
              <Popover.Description className="max-w-[16rem] text-end text-secondary text-xs">
                An offering is one dated run of a course. Each course can have
                multiple offerings.
              </Popover.Description>
            </div>
            <OfferingForm
              startsOnRef={(node) => {
                offeringPopoverFirstField.current = node;
              }}
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
              discardConfirm={
                popover.status === 'pinned' && popover.confirmingDiscard ? (
                  <OfferingDiscardConfirm
                    onKeepEditing={() => dispatch({ type: 'keepEditing' })}
                    onDiscard={close}
                  />
                ) : undefined
              }
            />
          </Popover.Popup>
        </OfferingPopoverPositionerContainer>
      </Popover.Portal>
    </Popover.Root>
  );
};
