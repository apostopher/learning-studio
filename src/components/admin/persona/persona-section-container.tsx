import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  editingPersonaIdAtom,
  newPersonaNameAtom,
  pendingDeletePersonaIdAtom,
  personaPaneAtom,
} from '#/atoms/admin';
import {
  useCoursePersona,
  useSetCoursePersona,
} from '#/data-hooks/use-course-persona';
import {
  PersonaRequestError,
  sendPersonaDraftBeacon,
  useCreatePersona,
  useDeletePersona,
  useDiscardPersonaDraft,
  usePersonas,
  usePublishPersona,
  useRenamePersona,
  useSavePersonaDraft,
  useSetOrgDefaultPersona,
} from '#/data-hooks/use-personas';
import type { AdminPersona, PersonaContentInput } from '#/lib/admin-schemas';
import { PersonaCarousel } from './persona-carousel';
import { PersonaEditor, type SaveStatus } from './persona-editor';
import { PersonaList } from './persona-list';

/** Debounce for the autosave. Long enough that a typing burst is one request. */
const AUTOSAVE_DEBOUNCE_MS = 800;
/** Ceiling on that debounce, so continuous typing still checkpoints. */
const AUTOSAVE_MAX_WAIT_MS = 5_000;

const EMPTY_CONTENT: PersonaContentInput = {
  basicInfo: '',
  mission: '',
  goal: '',
  communicationStyle: '',
  quotes: [],
  coreDirective: '',
  howToAnswer: '',
};

const FIELD_SPECS = [
  {
    name: 'basicInfo' as const,
    label: 'Basic information',
    hint: 'Identity, rank, call sign and role — who viper7 says he is.',
  },
  {
    name: 'mission' as const,
    label: 'Mission',
    hint: 'The purpose this persona serves for the people it teaches.',
  },
  {
    name: 'goal' as const,
    label: 'Goal',
    hint: 'What a conversation with this persona should ultimately achieve.',
  },
  {
    name: 'communicationStyle' as const,
    label: 'Communication style',
    hint: 'Tone, register and the kinds of analogy or anecdote to reach for.',
  },
  {
    name: 'coreDirective' as const,
    label: 'Core directive',
    hint: 'The rules that govern every interaction with a learner.',
  },
  {
    name: 'howToAnswer' as const,
    label: 'How to answer',
    hint: 'Structure and formatting: summaries, steps, lists, use of sources.',
  },
];

/** Form shape: the persona name lives alongside its content while editing. */
type EditorForm = PersonaContentInput & { name: string };

function contentOf(persona: AdminPersona): PersonaContentInput {
  return persona.draftContent ?? persona.content;
}

function sameContent(a: PersonaContentInput, b: PersonaContentInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Container for the AI-training modal's Persona section.
 *
 * Owns the carousel pane, the editor's form, and the autosave loop. The two
 * panes are always mounted (see `PersonaCarousel`), so the form survives a
 * trip back to the list and there is no unsaved-changes prompt to write:
 * everything typed is already a saved draft.
 */
export const PersonaSectionContainer = ({
  courseId,
  courseName,
}: {
  courseId: number;
  courseName: string;
}) => {
  const [pane, setPane] = useAtom(personaPaneAtom);
  const [editingId, setEditingId] = useAtom(editingPersonaIdAtom);
  const [pendingDeleteId, setPendingDeleteId] = useAtom(
    pendingDeletePersonaIdAtom,
  );
  const [newName, setNewName] = useAtom(newPersonaNameAtom);

  const personas = usePersonas();
  const selection = useCoursePersona(courseId);
  const setCoursePersona = useSetCoursePersona(courseId);
  const createPersona = useCreatePersona();
  const renamePersona = useRenamePersona();
  const deletePersona = useDeletePersona();
  const saveDraft = useSavePersonaDraft();
  const publishPersona = usePublishPersona();
  const discardDraft = useDiscardPersonaDraft();
  const setOrgDefault = useSetOrgDefaultPersona();

  const editing = useMemo(
    () => personas.data?.find((persona) => persona.id === editingId) ?? null,
    [personas.data, editingId],
  );

  const form = useForm<EditorForm>({
    // `values` (not defaultValues) so switching personas re-seeds the form.
    values: editing
      ? { ...contentOf(editing), name: editing.name }
      : { ...EMPTY_CONTENT, name: '' },
  });
  // Quotes are edited as a controlled list rather than through
  // `useFieldArray`, which only tracks arrays of objects — with flat strings,
  // removing a row leaves the uncontrolled input below it showing stale text.
  const quotes = form.watch('quotes') ?? [];
  const setQuotes = (next: string[]) =>
    form.setValue('quotes', next, { shouldDirty: true });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest content typed but not yet confirmed saved — what a flush sends. */
  const pendingRef = useRef<{
    personaId: number;
    draft: PersonaContentInput;
  } | null>(null);

  const clearTimers = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (maxWaitRef.current) clearTimeout(maxWaitRef.current);
    debounceRef.current = null;
    maxWaitRef.current = null;
  }, []);

  const flush = useCallback(async () => {
    const pending = pendingRef.current;
    clearTimers();
    if (!pending) return;
    pendingRef.current = null;
    setSaveStatus('saving');
    try {
      await saveDraft.mutateAsync(pending);
      setSaveStatus('saved');
    } catch {
      // Keep the payload so the next change (or flush) retries it rather than
      // dropping the edit on the floor.
      pendingRef.current = pending;
      setSaveStatus('error');
    }
  }, [clearTimers, saveDraft]);

  const queueSave = useCallback(
    (personaId: number, draft: PersonaContentInput) => {
      pendingRef.current = { personaId, draft };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => void flush(),
        AUTOSAVE_DEBOUNCE_MS,
      );
      // Sustained typing keeps resetting the debounce, so a max-wait timer
      // guarantees a checkpoint even if the admin never pauses.
      if (!maxWaitRef.current) {
        maxWaitRef.current = setTimeout(
          () => void flush(),
          AUTOSAVE_MAX_WAIT_MS,
        );
      }
    },
    [flush],
  );

  // Watch the content fields and queue a save whenever they diverge from
  // what's stored. Not an effect over `form.watch()` state — RHF's subscription
  // fires per keystroke without a re-render, which is what keeps typing smooth.
  useEffect(() => {
    const subscription = form.watch((values, { name: changedField }) => {
      if (!editing || changedField === 'name') return;
      const draft: PersonaContentInput = {
        basicInfo: values.basicInfo ?? '',
        mission: values.mission ?? '',
        goal: values.goal ?? '',
        communicationStyle: values.communicationStyle ?? '',
        quotes: (values.quotes ?? []).filter(
          (quote): quote is string => typeof quote === 'string',
        ),
        coreDirective: values.coreDirective ?? '',
        howToAnswer: values.howToAnswer ?? '',
      };
      // Only stage a draft that actually differs from what's published —
      // otherwise publishing would immediately re-dirty the persona and the
      // "unpublished changes" badge would never clear.
      if (sameContent(draft, editing.content)) return;
      queueSave(editing.id, draft);
    });
    return () => subscription.unsubscribe();
  }, [form, editing, queueSave]);

  // Last-gasp flush. `pagehide` and `visibilitychange` are the pair that fire
  // reliably on mobile Safari, where `beforeunload` does not. A beacon is the
  // only transport still permitted at this point — hence the POST-shaped
  // draft route.
  useEffect(() => {
    const flushWithBeacon = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (sendPersonaDraftBeacon(pending.personaId, pending.draft)) {
        pendingRef.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushWithBeacon();
    };
    window.addEventListener('pagehide', flushWithBeacon);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushWithBeacon);
      document.removeEventListener('visibilitychange', onVisibility);
      // Unmounting means the modal closed: send whatever is still pending.
      flushWithBeacon();
      clearTimers();
    };
  }, [clearTimers]);

  const openEditor = (personaId: number) => {
    setEditingId(personaId);
    setSaveStatus('idle');
    setPane('editor');
  };

  const handleBack = async () => {
    await flush();
    setPane('list');
    // Refresh badges (Draft / usage) that the autosave deliberately didn't
    // invalidate while the form was open.
    await personas.refetch();
    setSaveStatus('idle');
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (name === '') return;
    const created = await createPersona.mutateAsync(name).catch(() => null);
    if (!created) return;
    setNewName('');
    openEditor(created.id);
  };

  const handleRename = async () => {
    const name = form.getValues('name').trim();
    if (!editing || name === '' || name === editing.name) return;
    await renamePersona
      .mutateAsync({ personaId: editing.id, name })
      .catch(() => {
        // Leave the typed value in place so it can be corrected; the error
        // below names the conflict.
      });
  };

  const editorFields = FIELD_SPECS.map((spec) => ({
    name: spec.name,
    label: spec.label,
    hint: spec.hint,
    register: form.register(spec.name),
    usingDefault: (form.watch(spec.name) ?? '').trim() === '',
  }));

  const renameError =
    renamePersona.error instanceof PersonaRequestError
      ? renamePersona.error.message
      : undefined;
  const createError =
    createPersona.error instanceof PersonaRequestError
      ? createPersona.error.message
      : undefined;
  const selectionError =
    setCoursePersona.error instanceof PersonaRequestError
      ? setCoursePersona.error.message
      : undefined;
  const publishError =
    publishPersona.error instanceof PersonaRequestError
      ? publishPersona.error.message
      : undefined;

  return (
    <PersonaCarousel
      pane={pane}
      list={
        <PersonaList
          personas={personas.data ?? []}
          isLoading={personas.isLoading}
          loadError={
            personas.error
              ? 'Could not load personas. Close and reopen to retry.'
              : selectionError
          }
          courseName={courseName}
          // What the course is *actually* using: its own pin, else the org
          // default. There is no separate "use the org default" row — the
          // default is already marked in the list, and a second way to say the
          // same thing read as two competing selections.
          selectedPersonaId={
            selection.data?.personaId ??
            personas.data?.find((persona) => persona.isOrgDefault)?.id ??
            null
          }
          courseLinked={selection.data?.linked ?? false}
          onOpenEditor={openEditor}
          onSelectForCourse={(personaId) =>
            setCoursePersona.mutate(personaId, {
              onError: () => {
                /* surfaced via selectionError */
              },
            })
          }
          onToggleOrgDefault={(persona) =>
            setOrgDefault.mutate({
              personaId: persona.id,
              makeDefault: !persona.isOrgDefault,
            })
          }
          pendingDeleteId={pendingDeleteId}
          onRequestDelete={setPendingDeleteId}
          onConfirmDelete={(personaId) =>
            deletePersona.mutate(personaId, {
              onSuccess: () => {
                setPendingDeleteId(null);
                if (editingId === personaId) {
                  setEditingId(null);
                  setPane('list');
                }
              },
            })
          }
          isDeleting={deletePersona.isPending}
          newName={newName}
          onNewNameChange={setNewName}
          onCreate={handleCreate}
          isCreating={createPersona.isPending}
          createError={createError}
        />
      }
      editor={
        editing ? (
          <PersonaEditor
            registerName={form.register('name', { onBlur: handleRename })}
            nameError={renameError}
            fields={editorFields}
            quotes={quotes}
            onQuoteChange={(index, value) =>
              setQuotes(quotes.map((q, i) => (i === index ? value : q)))
            }
            onAddQuote={() => setQuotes([...quotes, ''])}
            onRemoveQuote={(index) =>
              setQuotes(quotes.filter((_, i) => i !== index))
            }
            quotesUsingDefault={
              quotes.filter((quote) => (quote ?? '').trim() !== '').length === 0
            }
            saveStatus={saveStatus}
            hasDraft={editing.draftContent !== null}
            onPublish={() => {
              // Flush first: publishing copies the stored draft, so an
              // un-flushed keystroke would be silently left behind.
              void flush().then(() => publishPersona.mutate(editing.id));
            }}
            onDiscard={() => {
              clearTimers();
              pendingRef.current = null;
              setSaveStatus('idle');
              discardDraft.mutate(editing.id);
            }}
            onBack={() => void handleBack()}
            isPublishing={publishPersona.isPending}
            isDiscarding={discardDraft.isPending}
            publishError={publishError}
            usedByCourses={editing.usedByCourses}
            isOrgDefault={editing.isOrgDefault}
          />
        ) : null
      }
    />
  );
};
