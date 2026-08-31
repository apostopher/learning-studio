import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';
import type { ProviderId } from '#/lib/admin-schemas';
import type { UserLevel } from '#/types';

/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);

/**
 * Whether the create-discipline dialog is open.
 *
 * Lives beside `createCourseDialogOpenAtom` rather than inside the dialog as
 * `useState`: the editor's library header owns the trigger while the dialog
 * itself renders further down the tree, and the two only ever meet through
 * this atom.
 */
export const createDisciplineDialogOpenAtom = atom(false);

/**
 * The search term in the create-discipline dialog's subject-expert picker.
 *
 * Separate from the form: it is what the picker is *searching for*, not what
 * the form will submit. React Query keys the candidate request on it, so
 * retyping a prefix is answered from cache.
 */
export const disciplineExpertQueryAtom = atom('');

/**
 * The discipline whose "add lesson" dialog is open, or null.
 *
 * Carries the NAME as well as the id because the dialog says which discipline
 * the lesson is being filed under, and re-deriving that from the library cache
 * inside the dialog would make it read a query it otherwise has no interest
 * in. Same reason `deleteModuleAtom` carries a name.
 */
export const createLibraryLessonTargetAtom = atom<{
  id: number;
  name: string;
} | null>(null);

/** The discipline being renamed from the library column, or null. */
export const renameDisciplineTargetAtom = atom<{
  id: number;
  name: string;
} | null>(null);

/**
 * The discipline pending deletion from the library column, or null.
 *
 * `lessonCount` rides along because it is the whole reason a delete is
 * refused: the dialog states the block and the number in plain text rather
 * than letting the user press a button that will 409.
 */
export const deleteDisciplineTargetAtom = atom<{
  id: number;
  name: string;
  lessonCount: number;
} | null>(null);

/**
 * The library lesson being edited from `/admin/editor`, or null.
 *
 * Distinct from `configureLessonIdAtom`, which drives the per-course configure
 * modal: that one edits how ONE course teaches a lesson (gates, sequencing,
 * video credentials) and needs a course to mean anything. This one edits what
 * the lesson IS, which is the same answer in every course teaching it.
 */
export const editLibraryLessonIdAtom = atom<number | null>(null);

/**
 * The course whose "create module" dialog is open on the ORG editor's rail, or
 * null.
 *
 * The rail shows many courses at once, which is why this carries a target
 * rather than being the boolean `createModuleDialogOpenAtom` beside it: one
 * shared boolean would open every column's dialog at the same time. The name
 * rides along so the dialog can say which course the module is going into.
 */
export const createModuleTargetAtom = atom<{
  id: number;
  name: string;
} | null>(null);

/** Whether the create-module dialog is open. */
export const createModuleDialogOpenAtom = atom(false);

/** Id of the module column currently being dragged, or null. */
export const activeDragModuleIdAtom = atom<number | null>(null);

/** Id of the lesson currently being dragged, or null. */
export const activeDragLessonIdAtom = atom<number | null>(null);

/**
 * The lesson pending deletion, or null when closed.
 *
 * Carries `courseCount` — how many courses currently teach the lesson —
 * because deleting is not the same act as removing a placement: it takes the
 * lesson out of every course at once and cascades its progress rows, and the
 * confirmation is not allowed to ask "are you sure?" without naming that
 * blast radius. The count is only ever computed in one place
 * (`LibraryLesson.courseCount`, from the org library query), so whoever opens
 * this dialog reads it from there rather than deriving a second answer.
 */
export const deleteLessonAtom = atom<{
  id: number;
  name: string;
  courseCount: number;
  /**
   * The exact accessible name of the "remove from module" control on the
   * surface that opened this dialog, or `null` when that surface has none.
   *
   * Carried because the confirmation's job is to point at the reversible act,
   * and the two surfaces differ: the knowledge editor's card has a remove
   * control (labelled by `removeLessonLabel`), the per-course board's card
   * does not. A sentence naming a button that is nowhere on the reader's
   * screen sends them hunting for it — worse than saying nothing — so the
   * copy branches on this rather than quoting one hard-coded phrase.
   */
  removeControlLabel: string | null;
} | null>(null);

/** Id of the lesson whose configure modal is open, or null when closed. */
export const configureLessonIdAtom = atom<number | null>(null);

/**
 * Id of the lesson whose video preview is open, or null when closed.
 *
 * Held here rather than in the card because `LessonCard` is presentational and
 * renders once per lesson plus once more in the drag overlay — a modal owned
 * by the card would exist N times over. It is also what keeps playback
 * resolution lazy: the provider is only called while this is non-null, so
 * loading the board costs no provider calls at all.
 */
export const playLessonIdAtom = atom<number | null>(null);

/** Module id whose create-lesson dialog is open, or null when closed. */
export const createLessonModuleIdAtom = atom<number | null>(null);

/** The module being edited (current field values), or null when closed. */
export const editModuleAtom = atom<{
  id: number;
  name: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
} | null>(null);
/** The module pending deletion (id + name), or null when closed. */
export const deleteModuleAtom = atom<{ id: number; name: string } | null>(null);

/** The course being edited (current field values), or null when closed. */
export const editCourseAtom = atom<{
  id: number;
  name: string;
  description: string | null;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
} | null>(null);
/** The course pending deletion (id + name), or null when closed. */
export const deleteCourseAtom = atom<{ id: number; name: string } | null>(null);

/**
 * What the course modal's News sources panel is showing.
 *
 * Carries the `courseId` it belongs to so a value left behind by a previously
 * edited course reads as stale and falls back to the list, rather than opening
 * the next course's panel onto a form for a source it does not own. Null means
 * the list.
 */
export const newsSourcePanelAtom = atom<{
  courseId: number;
  mode: 'create' | 'edit' | 'delete';
  /** The source being edited or deleted; absent for `create`. */
  sourceId?: number;
} | null>(null);

/**
 * Provider/ref detected from a video URL the admin just typed into the Video
 * tab but hasn't been confirmed by the board yet (the source of truth is the
 * lesson record once `useSetLessonVideo` succeeds and the board refetches).
 * Only one lesson-config modal is open at a time, so a single atom — not a
 * family — is enough. Reset when the modal switches lessons or the draft is
 * confirmed by the refetched board.
 */
export const videoDraftDetectionAtom = atom<{
  provider: ProviderId;
  ref: string;
} | null>(null);

/** Whether the Video tab is showing the "replace video URL" form over an already-configured video. */
export const videoReplaceModeAtom = atom(false);

/**
 * Set when the browser's own request for a resolved playback URL is refused
 * (401/403). This is the only signal that a Mux signing key has been revoked:
 * Mux JWTs are signed locally on our server, so playback resolution succeeds and
 * only Mux's edge rejects the token. Reset when the modal switches lessons.
 */
export const videoPlaybackForbiddenAtom = atom(false);

/** Course whose training-documents (AI embeddings) modal is open. */
export const trainCourseAtom = atom<{ id: number; name: string } | null>(null);

/** Client-side search filter for the training-documents list. Reset on close. */
export const embeddingsSearchAtom = atom('');

/**
 * The staff dialog's state, keyed by course id.
 *
 * An `atomFamily`, not four module-global atoms: the dialog is mounted once
 * per course editor and the panel is a per-course roster, so a single shared
 * cell carried one course's half-finished assignment into the next. Open the
 * panel on course A, pick a person, close it, open course B — and B's picker
 * showed A's selection, ready to be assigned to the wrong course. Keying by id
 * makes that unrepresentable without an effect to reset on navigation.
 */
export const courseStaffDialogOpenAtomFamily = atomFamily((_courseId: number) =>
  atom(false),
);

/**
 * Person picked in the staff dialog's assign form. Cleared after a successful
 * assign.
 *
 * Holds the label as well as the id because the candidate list is now a
 * server-side search: the options change as the search term does, so an id
 * alone would lose its display name the moment the term moved off it.
 */
export const courseStaffSelectedPersonAtomFamily = atomFamily(
  (_courseId: number) =>
    atom<{
      userId: string;
      label: string;
    } | null>(null),
);

/**
 * The person picker's search term. Lives here, not in the picker, because the
 * container turns it into a query — the directory is searched on the server,
 * since no client holds one an SME is allowed to read.
 */
export const courseStaffCandidateQueryAtomFamily = atomFamily(
  (_courseId: number) => atom(''),
);

/** Role picked in the staff dialog's assign form. Cleared after a successful assign. */
export const courseStaffSelectedRoleAtomFamily = atomFamily(
  (_courseId: number) => atom<string | null>(null),
);

/**
 * Which pane of the persona section's two-screen carousel is showing. Both
 * panes stay mounted — this only drives the track's horizontal offset — so the
 * editor's form state survives the slide without being lifted anywhere.
 */
export const personaPaneAtom = atom<'list' | 'editor'>('list');

/** Persona open in the editor pane. Null while the list pane is showing. */
export const editingPersonaIdAtom = atom<number | null>(null);

/** Persona whose delete confirmation is expanded in the list. */
export const pendingDeletePersonaIdAtom = atom<number | null>(null);

/** Draft name in the "New persona" inline field. Reset after a create. */
export const newPersonaNameAtom = atom('');

/** Person whose detail modal is open on /admin/users. */
export const openUserRowAtom = atom<{
  kind: 'user' | 'pending';
  profileId: number | null;
  email: string;
  name: string;
  roles: string[];
  courses: { id: number; name: string }[];
  /** Current level per course id. Absent for a course with no rows. */
  levels: Record<number, UserLevel>;
  joinedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  callSign: string | null;
  phoneNumber: string | null;
} | null>(null);

/**
 * Course id whose level history disclosure is open in the user detail modal,
 * or null when every disclosure is collapsed. Only one is ever open — the
 * history hook is keyed to a single (profile, course) pair, so opening a
 * second row's history closes the first rather than fetching both.
 */
export const openLevelHistoryCourseIdAtom = atom<number | null>(null);

/**
 * The course + target level a "set level" confirmation dialog is collecting
 * a message (and optional note) for. Null when the dialog is closed. Set the
 * moment the level select changes — the mutation itself doesn't fire until
 * the form is submitted, so picking a new level never writes anything on its
 * own.
 */
export const setLevelDraftAtom = atom<{
  courseId: number;
  courseName: string;
  level: UserLevel;
} | null>(null);

/** Whether the "add person" dialog is open. */
export const addPersonOpenAtom = atom(false);

/** Draft email in the add-person dialog. Cleared after a successful add. */
export const addUserEmailAtom = atom('');

/**
 * Courses selected in the add-person dialog. A pending row is an
 * (email, course) pair, so at least one is required for there to be anything
 * to store.
 */
export const addPersonCourseIdsAtom = atom<number[]>([]);

/**
 * Id of the LIBRARY lesson currently being dragged, or null.
 *
 * Separate from `activeDragLessonIdAtom`: that one holds a lesson already
 * placed in a module, and the two drags mean different things (this one
 * creates a placement, that one moves an existing one). One atom for both
 * would make the drag overlay unable to tell which card to draw, and the
 * whitelist unable to tell a `link` from a `move`.
 */
export const activeDragLibraryLessonIdAtom = atom<number | null>(null);

/**
 * Module ids whose accordion panel is open in the knowledge editor.
 *
 * Lifted out of `CourseColumn`'s accordion because a collapsed panel is
 * `hidden`, so its droppable measures 0×0 and cannot receive a lesson. The
 * editor auto-expands whatever module a drag hovers, which is only possible
 * from outside the accordion. Module ids are unique across the org, so one
 * flat list covers every course in the rail.
 */
export const expandedEditorModuleIdsAtom = atom<number[]>([]);

/**
 * Why the editor is refusing the drop currently under the pointer, or null.
 *
 * A refused drag must say why — a silent spring-back reads as broken
 * software. This drives the note attached to the drag overlay; the same
 * sentence is announced to screen readers through the DndContext's
 * accessibility announcements and, on an actual drop, raised as a toast.
 */
export const editorDragRefusalAtom = atom<string | null>(null);

/**
 * The library pane's inline size as a percentage of the editor, moved by the
 * pane splitter. Clamped by the splitter's handlers, not here.
 */
export const editorSplitPercentAtom = atom(40);
