import type { createStore } from 'jotai';
import { fromPromise, type SnapshotFrom, setup } from 'xstate';

import {
  credentialRejectionAtomFamily,
  credentialSaveErrorAtomFamily,
} from '../atoms/credential';

type JotaiStore = ReturnType<typeof createStore>;

/**
 * Provider-specific credential fields (Mux: `keyId` + `privateKey`; Synthesia:
 * `apiKey`). Already validated against the provider's own zod schema by the
 * container before `SUBMIT` is sent — the machine deliberately does not
 * re-validate, because field-level errors have to go back through
 * react-hook-form's `setError` to land on the right input.
 */
export type CredentialValues = Record<string, string>;

export type CredentialEvent =
  /** The credentials query settled. Syncs server truth into the flow. */
  | { type: 'LOADED'; configured: boolean }
  /** Admin clicked "Update key" / "Add key" — open the form. */
  | { type: 'EDIT' }
  /** Admin backed out of the form without saving. */
  | { type: 'CANCEL' }
  | { type: 'SUBMIT'; values: CredentialValues }
  /**
   * The provider refused the *stored* key (revoked or expired). Raised by the
   * playback consumer, not by this flow's own requests.
   *
   * NOTE: nothing sends this yet. `/api/admin/lessons/:id/video-playback`
   * currently collapses every provider failure into an unhandled 500 (a 401
   * from Synthesia is indistinguishable from a 404 for a deleted video), so
   * the `rejected` state below is unreachable until that route distinguishes
   * auth failures. See the ledger's "Open" section.
   */
  | { type: 'PROVIDER_REJECTED'; reason: unknown };

export interface CredentialDeps {
  store: JotaiStore;
  /** Atom-family key for this course+provider — see `credentialKey`. */
  key: string;
  /** Persists the credential. Rejects if the provider or the request refuses it. */
  saveCredential: (values: CredentialValues) => Promise<void>;
}

function messageOf(error: unknown): string | null {
  if (typeof error === 'string') return error.trim() || null;
  if (error && typeof error === 'object' && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

/**
 * The save route surfaces the provider's own refusal verbatim (e.g. "Synthesia
 * returned 401"). That is accurate but unhelpful, so a recognised auth refusal
 * is rewritten into something the admin can act on; anything else passes
 * through unchanged rather than being flattened into a generic failure.
 */
export function resolveSaveErrorMessage(error: unknown): string {
  const message = messageOf(error);
  if (message && /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)) {
    return "That key was refused by the provider. Check you copied it in full and that it hasn't been revoked.";
  }
  return message ?? "Couldn't save that key. Please try again.";
}

export function resolveRejectionMessage(reason: unknown): string {
  const message = messageOf(reason);
  return message
    ? `The stored key is no longer accepted by the provider (${message}). Enter a new key to restore playback.`
    : 'The stored key is no longer accepted by the provider. Enter a new key to restore playback.';
}

/**
 * Credential lifecycle for one course+provider pair.
 *
 * ```
 * loading ──LOADED──▶ absent{idle, form, saving}    no key stored
 *                 └─▶ configured{summary, editing, saving}
 *                       │ PROVIDER_REJECTED
 *                       ▼
 *                     rejected{notice, editing, saving}
 * ```
 *
 * `rejected` is a real state rather than just a flag so the UI cannot render a
 * configured-looking summary for a key the provider has stopped accepting, and
 * so "a successful save clears the rejection" is a transition you can assert on
 * rather than an action someone has to remember to write.
 *
 * Context-free, matching `authLoginMachine`: the machine declares states,
 * transitions, and the *names* of its effects; concrete implementations arrive
 * via `credentialMachine.provide(createCredentialImplementations(deps))`, so all
 * data lives in jotai and the network call stays in react-query.
 */
export const credentialMachine = setup({
  types: {
    events: {} as CredentialEvent,
  },
  actors: {
    saveCredential: fromPromise<void, { values: CredentialValues }>(
      async () => {},
    ),
  },
  actions: {
    setSaveError: (_, _params: { error: unknown }) => {},
    clearSaveError: () => {},
    setRejection: (_, _params: { reason: unknown }) => {},
    clearRejection: () => {},
  },
  guards: {
    // Pure — no injected dependency, so these are implemented here rather than stubbed.
    isConfigured: (_, params: { configured: boolean }) => params.configured,
    isNotConfigured: (_, params: { configured: boolean }) => !params.configured,
  },
}).createMachine({
  id: 'credential',
  initial: 'loading',
  states: {
    /**
     * Waiting on the credentials query. Distinct from `absent` so the UI can
     * show a spinner instead of flashing "Not connected" for a provider that
     * turns out to be configured.
     */
    loading: {
      on: {
        LOADED: [
          {
            guard: {
              type: 'isConfigured',
              params: ({ event }) => ({ configured: event.configured }),
            },
            target: 'configured',
          },
          { target: 'absent' },
        ],
      },
    },

    absent: {
      // Safe as an `entry`: no `invoke` in this state or its initial child, so
      // there is no invoked actor that could be racing this write.
      entry: 'clearRejection',
      initial: 'idle',
      states: {
        /**
         * No key, and the admin is not currently entering one — the settled
         * "Not connected" row. Keeps `EDIT` meaning "open the form" on every
         * surface, so the Video tab can open straight into the form by sending
         * `EDIT` while the course dialog waits for a click.
         */
        idle: {
          on: {
            EDIT: { target: 'form', actions: 'clearSaveError' },
            // Configured elsewhere (other tab, or the lesson Video tab).
            LOADED: {
              guard: {
                type: 'isConfigured',
                params: ({ event }) => ({ configured: event.configured }),
              },
              target: '#credential.configured',
            },
          },
        },
        form: {
          on: {
            SUBMIT: { target: 'saving', actions: 'clearSaveError' },
            CANCEL: { target: 'idle', actions: 'clearSaveError' },
          },
        },
        saving: {
          invoke: {
            src: 'saveCredential',
            input: ({ event }) => ({
              values: (event as Extract<CredentialEvent, { type: 'SUBMIT' }>)
                .values,
            }),
            onDone: { target: '#credential.configured' },
            onError: {
              target: 'form',
              actions: {
                type: 'setSaveError',
                params: ({ event }) => ({ error: event.error }),
              },
            },
          },
        },
      },
    },

    configured: {
      initial: 'summary',
      states: {
        summary: {
          on: {
            EDIT: { target: 'editing', actions: 'clearSaveError' },
            // Only accepted from `summary`. While the admin is already typing a
            // replacement, telling them the old key is bad is noise.
            PROVIDER_REJECTED: {
              target: '#credential.rejected',
              actions: {
                type: 'setRejection',
                params: ({ event }) => ({ reason: event.reason }),
              },
            },
            // Removed elsewhere (course dialog's Remove button, or another tab).
            LOADED: {
              guard: {
                type: 'isNotConfigured',
                params: ({ event }) => ({ configured: event.configured }),
              },
              target: '#credential.absent',
            },
          },
        },
        editing: {
          on: {
            SUBMIT: { target: 'saving', actions: 'clearSaveError' },
            CANCEL: { target: 'summary', actions: 'clearSaveError' },
          },
        },
        saving: {
          invoke: {
            src: 'saveCredential',
            input: ({ event }) => ({
              values: (event as Extract<CredentialEvent, { type: 'SUBMIT' }>)
                .values,
            }),
            onDone: { target: 'summary' },
            onError: {
              target: 'editing',
              actions: {
                type: 'setSaveError',
                params: ({ event }) => ({ error: event.error }),
              },
            },
          },
        },
      },
    },

    rejected: {
      initial: 'notice',
      states: {
        notice: {
          on: {
            EDIT: { target: 'editing', actions: 'clearSaveError' },
            LOADED: {
              guard: {
                type: 'isNotConfigured',
                params: ({ event }) => ({ configured: event.configured }),
              },
              target: '#credential.absent',
            },
          },
        },
        editing: {
          on: {
            SUBMIT: { target: 'saving', actions: 'clearSaveError' },
            CANCEL: { target: 'notice', actions: 'clearSaveError' },
          },
        },
        saving: {
          invoke: {
            src: 'saveCredential',
            input: ({ event }) => ({
              values: (event as Extract<CredentialEvent, { type: 'SUBMIT' }>)
                .values,
            }),
            // Clearing the rejection is the whole point of this path: without
            // it the "key no longer accepted" banner would outlive the key it
            // described and sit above a freshly-working credential.
            onDone: {
              target: '#credential.configured',
              actions: 'clearRejection',
            },
            onError: {
              target: 'editing',
              actions: {
                type: 'setSaveError',
                params: ({ event }) => ({ error: event.error }),
              },
            },
          },
        },
      },
    },
  },
});

export type CredentialSnapshot = SnapshotFrom<typeof credentialMachine>;

/**
 * Whether the credential form should be on screen.
 *
 * `saving` counts as open deliberately. A failed save returns to `editing`, so
 * if this went false in between, a consumer that resets its form on the
 * closed→open edge would wipe the key the admin just typed — defeating the
 * whole reason `onError` targets `editing` rather than the summary.
 */
export const isCredentialFormOpen = (snapshot: CredentialSnapshot): boolean =>
  snapshot.matches({ absent: 'form' }) ||
  snapshot.matches({ absent: 'saving' }) ||
  snapshot.matches({ configured: 'editing' }) ||
  snapshot.matches({ configured: 'saving' }) ||
  snapshot.matches({ rejected: 'editing' }) ||
  snapshot.matches({ rejected: 'saving' });

/** Whether a save request is in flight, from any of the three entry points. */
export const isCredentialSaving = (snapshot: CredentialSnapshot): boolean =>
  snapshot.matches({ absent: 'saving' }) ||
  snapshot.matches({ configured: 'saving' }) ||
  snapshot.matches({ rejected: 'saving' });

/**
 * Builds the concrete actor/action implementations for `credentialMachine`.
 * Everything touching jotai or the network is closed over here, keeping the
 * machine itself pure and testable.
 */
export function createCredentialImplementations(deps: CredentialDeps) {
  const { store, key } = deps;
  const saveErrorAtom = credentialSaveErrorAtomFamily(key);
  const rejectionAtom = credentialRejectionAtomFamily(key);

  return {
    actors: {
      saveCredential: fromPromise<void, { values: CredentialValues }>(
        async ({ input }) => {
          await deps.saveCredential(input.values);
        },
      ),
    },
    actions: {
      setSaveError: (_: unknown, params: { error: unknown }) => {
        store.set(saveErrorAtom, resolveSaveErrorMessage(params.error));
      },
      clearSaveError: () => {
        store.set(saveErrorAtom, null);
      },
      setRejection: (_: unknown, params: { reason: unknown }) => {
        store.set(rejectionAtom, resolveRejectionMessage(params.reason));
      },
      clearRejection: () => {
        store.set(rejectionAtom, null);
      },
    },
  };
}
