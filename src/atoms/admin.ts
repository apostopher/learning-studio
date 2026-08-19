import { atom } from 'jotai';
import type { ProviderId } from '@/lib/admin-schemas';
import type { UserLevel } from '@/types';

/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);

/** Whether the create-module dialog is open. */
export const createModuleDialogOpenAtom = atom(false);

/** Id of the module column currently being dragged, or null. */
export const activeDragModuleIdAtom = atom<number | null>(null);

/** Id of the lesson currently being dragged, or null. */
export const activeDragLessonIdAtom = atom<number | null>(null);

/** The lesson pending deletion (id + name), or null when closed. */
export const deleteLessonAtom = atom<{ id: number; name: string } | null>(null);

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
