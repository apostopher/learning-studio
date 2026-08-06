import { Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { ScrollArea } from '#/components/scroll-area';
import type { AdminPersona } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';

interface PersonaListProps {
  personas: AdminPersona[];
  isLoading: boolean;
  loadError?: string;
  /** Course this modal was opened for — the selection radios apply to it. */
  courseName: string;
  /**
   * The persona this course is *effectively* using: its own pin, or the org
   * default when it has none. Checking the effective one rather than only an
   * explicit pin keeps a never-configured course from rendering with nothing
   * selected while its chats are in fact already using a persona.
   */
  selectedPersonaId: number | null;
  /** False when the course isn't a member of the active org. */
  courseLinked: boolean;
  onOpenEditor: (personaId: number) => void;
  onSelectForCourse: (personaId: number) => void;
  onToggleOrgDefault: (persona: AdminPersona) => void;
  /** Id whose delete confirmation is expanded, if any. */
  pendingDeleteId: number | null;
  onRequestDelete: (personaId: number | null) => void;
  onConfirmDelete: (personaId: number) => void;
  isDeleting: boolean;
  newName: string;
  onNewNameChange: (value: string) => void;
  onCreate: () => void;
  isCreating: boolean;
  createError?: string;
}

const UNPUBLISHED_REASON = 'Publish this persona before assigning it';

/**
 * List pane of the persona carousel: every persona in the org, which one this
 * course uses, and which is the org fallback.
 *
 * Assignment controls are disabled while a persona has never been published —
 * its content is still empty, so assigning it would silently fall through to
 * the prompt's built-in defaults. The reason is rendered as visible text and
 * carried in each control's accessible name, so it is never a dead control
 * with no explanation.
 */
export const PersonaList = ({
  personas,
  isLoading,
  loadError,
  courseName,
  selectedPersonaId,
  courseLinked,
  onOpenEditor,
  onSelectForCourse,
  onToggleOrgDefault,
  pendingDeleteId,
  onRequestDelete,
  onConfirmDelete,
  isDeleting,
  newName,
  onNewNameChange,
  onCreate,
  isCreating,
  createError,
}: PersonaListProps) => (
  <ScrollArea className="h-full min-h-0" viewportClassName="p-6">
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-semibold text-2xl text-primary">Persona</h2>
        <p className="text-secondary text-sm">
          Personas belong to the organisation — every course can use any of
          them. The one selected here is what viper7 becomes in{' '}
          <span className="font-medium text-primary">{courseName}</span>.
        </p>
      </header>

      {!courseLinked && !isLoading && (
        <p className="rounded-lg border border-warning-muted bg-warning-subtle px-3 py-2 text-sm text-warning-text">
          This course isn't part of the active organisation, so it can't select
          a persona. Its chats use the organisation default.
        </p>
      )}

      {loadError && (
        <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <p className="flex items-center gap-2 text-secondary text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading personas…
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {personas.map((persona) => {
            const assignable = persona.isPublished;
            const isConfirmingDelete = pendingDeleteId === persona.id;

            return (
              <li
                key={persona.id}
                className={cn(
                  'rounded-lg border border-gray-6 bg-gray-1',
                  selectedPersonaId === persona.id &&
                    'border-apple-8 bg-gray-3',
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="radio"
                    name="course-persona"
                    checked={selectedPersonaId === persona.id}
                    disabled={!assignable || !courseLinked}
                    onChange={() => onSelectForCourse(persona.id)}
                    aria-label={
                      assignable
                        ? `Use ${persona.name} for ${courseName}`
                        : `${persona.name} — ${UNPUBLISHED_REASON}`
                    }
                    className="h-4 w-4 accent-apple-9 disabled:opacity-40"
                  />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-primary text-sm">
                        {persona.name}
                      </span>
                      {persona.isOrgDefault && (
                        <span className="rounded-full bg-apple-3 px-2 py-0.5 text-apple-text text-xs">
                          Org default
                        </span>
                      )}
                      {persona.draftContent !== null && (
                        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-warning-text text-xs">
                          Unpublished changes
                        </span>
                      )}
                    </span>
                    <span className="text-secondary text-xs">
                      {!persona.isPublished
                        ? `Never published — ${UNPUBLISHED_REASON.toLowerCase()}.`
                        : persona.usedByCourses.length > 0
                          ? `Used by ${persona.usedByCourses.join(', ')}`
                          : 'Not used by any course'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleOrgDefault(persona)}
                    disabled={!assignable}
                    aria-label={
                      assignable
                        ? persona.isOrgDefault
                          ? `Clear ${persona.name} as the organisation default`
                          : `Make ${persona.name} the organisation default`
                        : `${persona.name} — ${UNPUBLISHED_REASON}`
                    }
                    className="shrink-0 rounded-md p-2 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Star
                      className={cn(
                        'h-4 w-4',
                        persona.isOrgDefault && 'fill-apple-9 text-apple-9',
                      )}
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenEditor(persona.id)}
                    aria-label={`Edit ${persona.name}`}
                    className="shrink-0 rounded-md p-2 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onRequestDelete(isConfirmingDelete ? null : persona.id)
                    }
                    aria-label={`Delete ${persona.name}`}
                    aria-expanded={isConfirmingDelete}
                    className="shrink-0 rounded-md p-2 text-secondary transition-colors hover:bg-error-subtle hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {isConfirmingDelete && (
                  // The consequence is stated before the click, not after:
                  // deleting nulls every course selection pointing here, and
                  // those courses quietly fall back down the chain.
                  <div className="flex flex-col gap-3 border-gray-6 border-t px-4 py-3">
                    <p className="text-secondary text-sm">
                      Delete{' '}
                      <span className="text-primary">{persona.name}</span>?{' '}
                      {persona.usedByCourses.length > 0
                        ? `${persona.usedByCourses.join(', ')} will fall back to the organisation default.`
                        : 'No course is using it.'}
                      {persona.isOrgDefault &&
                        ' It is the organisation default, so courses with no persona of their own will fall back to viper7’s built-in defaults.'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onConfirmDelete(persona.id)}
                        disabled={isDeleting}
                        className="inline-flex items-center gap-2 rounded-lg bg-error px-3 py-1.5 font-medium text-on-error text-sm transition-colors hover:bg-error-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-9 disabled:opacity-60"
                      >
                        {isDeleting && (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        Delete persona
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDelete(null)}
                        className="rounded-lg border border-gray-6 px-3 py-1.5 font-medium text-primary text-sm hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
        className="flex flex-col gap-2 border-gray-6 border-t pt-4"
      >
        <label
          htmlFor="new-persona-name"
          className="font-medium text-primary text-sm"
        >
          New persona
        </label>
        <div className="flex gap-2">
          <input
            id="new-persona-name"
            value={newName}
            onChange={(event) => onNewNameChange(event.target.value)}
            placeholder="e.g. Viper7 — recurrent training"
            aria-invalid={createError ? true : undefined}
            aria-describedby={createError ? 'new-persona-error' : undefined}
            className="min-w-0 flex-1 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          />
          <button
            type="submit"
            disabled={isCreating || newName.trim() === ''}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Create
          </button>
        </div>
        {createError && (
          <p id="new-persona-error" className="text-error-text text-sm">
            {createError}
          </p>
        )}
      </form>
    </div>
  </ScrollArea>
);
