import { Popover } from '@base-ui/react/popover';
import { zodResolver } from '@hookform/resolvers/zod';
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { X } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  dispatchOfferingPopoverAtom,
  offeringPopoverAtom,
  offeringPopoverReturnFocusAtom,
  offeringPopoverSuppressFocusPreviewAtom,
} from '#/atoms/schedule';
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
import { OfferingDiscardConfirm } from './offering-discard-confirm';
import { OfferingForm } from './offering-form';
import { OfferingPopoverPositionerContainer } from './offering-popover-positioner-container';
import type { PopoverTarget } from './offering-popover-state';
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

/** The form with nothing open — also what `values` holds while closed. */
const EMPTY_SEED: OfferingFormValues = { startsOn: '', endsOn: '', users: [] };

/**
 * What Save writes to: a course to schedule, or the offering row being
 * edited — the ROW, not its id, so a target that no longer resolves cannot be
 * represented at all.
 */
type SaveTarget =
  | Extract<PopoverTarget, { mode: 'create' }>
  | { mode: 'edit'; offering: Offering };

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
  isListSettled,
}: {
  offerings: Offering[];
  /**
   * Whether `offerings` is the loaded answer for the window on screen — not
   * the first load, and not the previous window's rows kept as placeholder
   * while the next loads. Only then does an id missing from it mean the
   * offering is gone.
   */
  isListSettled: boolean;
}) => {
  const popover = useAtomValue(offeringPopoverAtom);
  const dispatch = useSetAtom(dispatchOfferingPopoverAtom);
  // For atoms only callbacks need, read lazily via `store.get`. This container
  // never subscribes to the anchor: it changes on every pointermove during a
  // preview, and only the positioner may re-render for that.
  const store = useStore();

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

  const saveTarget: SaveTarget | null =
    dialog?.mode === 'create'
      ? dialog
      : editing
        ? { mode: 'edit', offering: editing }
        : null;

  // The offering being edited left the list — the window moved past it, or
  // someone else unscheduled it. The popover closes rather than showing a
  // blank title over a Save with nothing to save to: `open` drops at once,
  // and the state follows through `close` when Base UI reports the popup
  // gone (onOpenChangeComplete — an event, not an effect).
  const isOrphaned = dialog?.mode === 'edit' && !editing && isListSettled;

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
    defaultValues: EMPTY_SEED,
    // Seeded by RHF rather than by an effect (docs/use-effect-rules.md). The
    // dialog is mounted once and re-pointed at whatever was dropped or
    // clicked, so `defaultValues` alone would only ever describe the first
    // one. `keepDirtyValues` protects fields already edited from a background
    // refetch of the offerings list underneath them.
    //
    // Always defined, empty while closed: RHF re-seeds only when `values`
    // deep-changes, so `undefined` while closed meant reopening the SAME
    // offering after Cancel matched the last seed and left the form blank.
    values: dialog
      ? {
          startsOn: seedStartsOn,
          endsOn: seedEndsOn,
          users: editing?.users ?? [],
        }
      : EMPTY_SEED,
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
    // `keepDirtyValues: false` explicitly: RHF merges the form's
    // `resetOptions` into every reset, so a bare reset KEPT the dirty fields —
    // "Discard changes" discarded nothing, and re-pinning showed the edits.
    form.reset(EMPTY_SEED, { keepDirtyValues: false });
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
    // Unreachable without a target: the popover is closed whenever there is
    // none, and Base UI makes a closed positioner inert.
    if (!saveTarget) return;
    const userIds = values.users.map((person) => person.userId);
    if (saveTarget.mode === 'create') {
      create.mutate(
        {
          courseId: saveTarget.courseId,
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
    update.mutate(
      {
        offeringId: saveTarget.offering.id,
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

  const handleDelete = (offering: Offering) => {
    remove.mutate(offering.id, {
      onSuccess: () => {
        toast.success(`${offering.courseName} unscheduled`);
        close();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const saveError =
    create.error?.message ?? update.error?.message ?? remove.error?.message;

  const isDirty = form.formState.isDirty;

  const keepEditing = () => {
    dispatch({ type: 'keepEditing' });
    // The confirm unmounts with the button that had focus, which would drop
    // focus to <body>. Put it back on the first field once the footer is back.
    requestAnimationFrame(() => offeringPopoverFirstField.current?.focus());
  };

  return (
    <Popover.Root
      open={saveTarget !== null}
      // Unsaved edits make the popover modal (Base UI `true`: a backdrop takes
      // outside presses, page scroll locks, and — with the Close part below —
      // focus is trapped). A press outside then only raises the discard
      // question instead of ALSO acting on what was under it: the calendar's
      // arrows used to move the window out from under the form, and a nav
      // link left the page with the popover stale. A clean pin stays
      // non-modal so clicking another bar still switches to it.
      // ('trap-focus' would leave outside pointer presses live.)
      modal={isPinned && isDirty}
      onOpenChangeComplete={(open) => {
        if (!open && isOrphaned) close();
      }}
      onOpenChange={(open, details) => {
        if (open) return;
        // A mouse click elsewhere put the user's attention THERE: even after a
        // keyboard pin, focus must not be pulled back to the bar it came from.
        if (details.reason === 'outside-press')
          store.set(offeringPopoverReturnFocusAtom, null);
        // Only dismissals reach here — this popover has no Trigger, so Base UI
        // never asks to open it. Every exit path goes through the reducer.
        //
        // Any path that leaves the popover open cancels Base UI's close, so it
        // records no internal close (and no "skip return focus") for a popover
        // that is in fact still showing.
        if (
          details.reason !== 'escape-key' &&
          details.reason !== 'outside-press' &&
          details.reason !== 'close-press'
        ) {
          // e.g. focus-out: a pinned form must survive focus wandering off.
          details.cancel();
          return;
        }
        // A clean pinned popover closes through `close` so the form and the
        // mutations reset.
        if (popover.status === 'pinned' && !isDirty) {
          close();
          return;
        }
        // Everything else is the reducer's call: a dirty pin asks first, and a
        // preview ignores outside-press (the pointer leaving closes it).
        // The Close button asks exactly what Esc asks.
        const reason =
          details.reason === 'outside-press' ? 'outside' : 'escape';
        const staysOpen =
          popover.status === 'pinned' ||
          (popover.status === 'preview' && reason === 'outside');
        if (staysOpen) details.cancel();
        dispatch({ type: 'dismiss', reason, dirty: isDirty });
      }}
    >
      <Popover.Portal>
        <OfferingPopoverPositionerContainer isPreview={!isPinned}>
          <Popover.Popup
            // A preview must not take focus from the bar the keyboard is on;
            // the page focuses the first field after a pin.
            initialFocus={false}
            // Returns focus ONLY when the page recorded a segment, which it
            // does only for a keyboard pin. Anything else returns false so
            // Base UI leaves focus where the user put it — a mouse click
            // elsewhere, or a preview unmounting as Tab moves past the last
            // segment. Read-and-clear, so a stale element never comes back.
            finalFocus={() => {
              const el = store.get(offeringPopoverReturnFocusAtom);
              store.set(offeringPopoverReturnFocusAtom, null);
              // The focus this causes must not re-open a preview of the
              // offering just closed (see the atom's doc).
              store.set(offeringPopoverSuppressFocusPreviewAtom, el);
              return el ?? false;
            }}
            // A preview is a picture of the offering, not a form: inert
            // removes it from the tab order and the accessibility tree. The
            // positioner turns off pointer events for it (see `isPreview`).
            inert={!isPinned || undefined}
            // Physical-axis overflow: Tailwind has no overflow-block utility
            // (the same exception as the roster table's scroller).
            className="offering-popover relative flex flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl border border-gray-6 bg-gray-2 p-5 shadow-xl [inline-size:min(34rem,calc(100vw-2rem))] [max-block-size:var(--available-height)]"
          >
            {/* A subtitle under the title, not a block beside it: course names
                are long enough that a side-by-side explainer almost always
                wrapped, leaving a narrow end-aligned column stranded below. */}
            <div className="flex flex-col gap-1 pe-8">
              <Popover.Title className="font-semibold text-accent-text text-lg">
                {courseName}
              </Popover.Title>
              <Popover.Description className="text-secondary text-xs">
                An offering is one dated run of a course. Each course can have
                multiple offerings.
              </Popover.Description>
            </div>
            {/* Base UI traps focus in a modal popover only when a Close
                part is rendered. It is also a visible way out for touch
                and screen-reader users who have no Esc key; it asks the
                same discard question Esc does. Pinned to the corner, not
                the header row, so a wrapping title cannot move it. */}
            <Popover.Close
              aria-label="Close"
              className="absolute inset-bs-3 end-3 shrink-0 rounded-md p-2 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Popover.Close>
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
              onDelete={
                saveTarget?.mode === 'edit'
                  ? () => handleDelete(saveTarget.offering)
                  : undefined
              }
              isSaving={isSaving}
              submitLabel={dialog?.mode === 'edit' ? 'Save' : 'Schedule'}
              saveError={saveError}
              discardConfirm={
                popover.status === 'pinned' && popover.confirmingDiscard ? (
                  <OfferingDiscardConfirm
                    onKeepEditing={keepEditing}
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
