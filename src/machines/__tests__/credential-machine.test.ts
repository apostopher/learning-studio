import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { createActor, waitFor } from 'xstate';

import {
  credentialKey,
  credentialRejectionAtomFamily,
  credentialSaveErrorAtomFamily,
} from '../../atoms/credential';
import {
  type CredentialValues,
  createCredentialImplementations,
  credentialMachine,
  isCredentialFormOpen,
  isCredentialSaving,
} from '../credential-machine';

const KEY = credentialKey(7, 'mux');
const saveErrorAtom = credentialSaveErrorAtomFamily(KEY);
const rejectionAtom = credentialRejectionAtomFamily(KEY);

const MUX_VALUES: CredentialValues = {
  keyId: 'abc123',
  privateKey: 'LS0tLXByaXZhdGU=',
};

function makeActor(
  saveCredential: (values: CredentialValues) => Promise<void> = vi.fn(
    async () => {},
  ),
) {
  const store = createStore();
  const save = vi.fn(saveCredential);
  const actor = createActor(
    credentialMachine.provide(
      createCredentialImplementations({
        store,
        key: KEY,
        saveCredential: save,
      }),
    ),
  );
  return { store, actor, save };
}

/** Drives the actor to a settled `configured.summary`. */
function startConfigured(
  saveCredential?: (values: CredentialValues) => Promise<void>,
) {
  const harness = makeActor(saveCredential);
  harness.actor.start();
  harness.actor.send({ type: 'LOADED', configured: true });
  return harness;
}

describe('credentialMachine', () => {
  describe('loading', () => {
    it('routes to absent when the course has no key', () => {
      const { actor } = makeActor();
      actor.start();

      actor.send({ type: 'LOADED', configured: false });

      expect(actor.getSnapshot().matches({ absent: 'idle' })).toBe(true);
      actor.stop();
    });

    it('routes to configured when the course already has a key', () => {
      const { actor } = makeActor();
      actor.start();

      actor.send({ type: 'LOADED', configured: true });

      expect(actor.getSnapshot().matches({ configured: 'summary' })).toBe(true);
      actor.stop();
    });
  });

  describe('first-time setup', () => {
    it('opens the form on EDIT and returns to idle on CANCEL', () => {
      const { actor, save } = makeActor();
      actor.start();
      actor.send({ type: 'LOADED', configured: false });

      actor.send({ type: 'EDIT' });
      expect(actor.getSnapshot().matches({ absent: 'form' })).toBe(true);

      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().matches({ absent: 'idle' })).toBe(true);
      expect(save).not.toHaveBeenCalled();
      actor.stop();
    });

    it('does not save from idle without the form being opened first', () => {
      const { actor, save } = makeActor();
      actor.start();
      actor.send({ type: 'LOADED', configured: false });

      actor.send({ type: 'SUBMIT', values: MUX_VALUES });

      expect(actor.getSnapshot().matches({ absent: 'idle' })).toBe(true);
      expect(save).not.toHaveBeenCalled();
      actor.stop();
    });

    it('jumps to configured when the key appears from another surface', () => {
      const { actor } = makeActor();
      actor.start();
      actor.send({ type: 'LOADED', configured: false });

      // e.g. the same provider was connected in the lesson Video tab.
      actor.send({ type: 'LOADED', configured: true });

      expect(actor.getSnapshot().matches({ configured: 'summary' })).toBe(true);
      actor.stop();
    });

    it('hands the submitted values to saveCredential and lands on the summary', async () => {
      const { actor, save } = makeActor();
      actor.start();
      actor.send({ type: 'LOADED', configured: false });
      actor.send({ type: 'EDIT' });

      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      const snapshot = await waitFor(actor, (s) =>
        s.matches({ configured: 'summary' }),
      );

      // Assert on what the consumer received, not on state that merely holds it.
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toEqual(MUX_VALUES);
      expect(snapshot.matches({ configured: 'summary' })).toBe(true);
      actor.stop();
    });

    it('returns to the form and records a friendlier message when the provider refuses the key', async () => {
      const { store, actor } = makeActor(async () => {
        throw new Error('Synthesia returned 401');
      });
      actor.start();
      actor.send({ type: 'LOADED', configured: false });
      actor.send({ type: 'EDIT' });

      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      await waitFor(
        actor,
        (s) =>
          s.matches({ absent: 'form' }) && store.get(saveErrorAtom) !== null,
      );

      expect(store.get(saveErrorAtom)).toBe(
        "That key was refused by the provider. Check you copied it in full and that it hasn't been revoked.",
      );
      actor.stop();
    });

    it('passes through an unrecognised failure message rather than flattening it', async () => {
      const { store, actor } = makeActor(async () => {
        throw new Error('Signing key ID must be 16 characters');
      });
      actor.start();
      actor.send({ type: 'LOADED', configured: false });
      actor.send({ type: 'EDIT' });

      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      await waitFor(
        actor,
        (s) =>
          s.matches({ absent: 'form' }) && store.get(saveErrorAtom) !== null,
      );

      expect(store.get(saveErrorAtom)).toBe(
        'Signing key ID must be 16 characters',
      );
      actor.stop();
    });
  });

  describe('updating an existing key', () => {
    it('opens and cancels the form without calling saveCredential', () => {
      const { actor, save } = startConfigured();

      actor.send({ type: 'EDIT' });
      expect(actor.getSnapshot().matches({ configured: 'editing' })).toBe(true);

      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().matches({ configured: 'summary' })).toBe(true);
      expect(save).not.toHaveBeenCalled();
      actor.stop();
    });

    it('clears a previous save error when the form is reopened', async () => {
      const { store, actor } = startConfigured(async () => {
        throw new Error('boom');
      });

      actor.send({ type: 'EDIT' });
      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      await waitFor(
        actor,
        (s) =>
          s.matches({ configured: 'editing' }) &&
          store.get(saveErrorAtom) !== null,
      );
      expect(store.get(saveErrorAtom)).toBe('boom');

      actor.send({ type: 'CANCEL' });
      expect(store.get(saveErrorAtom)).toBeNull();
      actor.stop();
    });

    it('returns to editing — not the summary — when the update fails', async () => {
      const { store, actor } = startConfigured(async () => {
        throw new Error('boom');
      });

      actor.send({ type: 'EDIT' });
      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      const snapshot = await waitFor(
        actor,
        (s) =>
          s.matches({ configured: 'editing' }) &&
          store.get(saveErrorAtom) !== null,
      );

      // Falling back to `summary` would discard the admin's typed key and hide
      // the error next to the field that caused it.
      expect(snapshot.matches({ configured: 'editing' })).toBe(true);
      actor.stop();
    });

    it('ignores a refetch while the admin is mid-edit', () => {
      const { actor } = startConfigured();

      actor.send({ type: 'EDIT' });
      actor.send({ type: 'LOADED', configured: true });

      expect(actor.getSnapshot().matches({ configured: 'editing' })).toBe(true);
      actor.stop();
    });
  });

  describe('a key the provider has stopped accepting', () => {
    it('moves to the rejected notice and records why', () => {
      const { store, actor } = startConfigured();

      actor.send({
        type: 'PROVIDER_REJECTED',
        reason: new Error('Mux returned 401'),
      });

      expect(actor.getSnapshot().matches({ rejected: 'notice' })).toBe(true);
      expect(store.get(rejectionAtom)).toBe(
        'The stored key is no longer accepted by the provider (Mux returned 401). Enter a new key to restore playback.',
      );
      actor.stop();
    });

    it('accepts a plain string reason from the playback layer', () => {
      const { store, actor } = startConfigured();

      // The Video tab passes a message, not an Error: the rejection may have
      // come from the browser's own refused manifest request rather than from a
      // thrown server error.
      actor.send({
        type: 'PROVIDER_REJECTED',
        reason: 'Synthesia refused the stored API key (401).',
      });

      expect(store.get(rejectionAtom)).toBe(
        'The stored key is no longer accepted by the provider (Synthesia refused the stored API key (401).). Enter a new key to restore playback.',
      );
      actor.stop();
    });

    it('does not interrupt an admin who is already typing a replacement', () => {
      const { store, actor } = startConfigured();

      actor.send({ type: 'EDIT' });
      actor.send({ type: 'PROVIDER_REJECTED', reason: new Error('401') });

      expect(actor.getSnapshot().matches({ configured: 'editing' })).toBe(true);
      expect(store.get(rejectionAtom)).toBeNull();
      actor.stop();
    });

    it('clears the rejection once a replacement key saves', async () => {
      const { store, actor, save } = startConfigured();

      actor.send({ type: 'PROVIDER_REJECTED', reason: new Error('401') });
      actor.send({ type: 'EDIT' });
      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      const snapshot = await waitFor(actor, (s) =>
        s.matches({ configured: 'summary' }),
      );

      expect(save.mock.calls[0][0]).toEqual(MUX_VALUES);
      expect(snapshot.matches({ configured: 'summary' })).toBe(true);
      // A surviving banner would sit above a credential that now works.
      expect(store.get(rejectionAtom)).toBeNull();
      actor.stop();
    });

    it('keeps the rejection visible when the replacement key also fails', async () => {
      const { store, actor } = startConfigured(async () => {
        throw new Error('Mux returned 401');
      });

      actor.send({
        type: 'PROVIDER_REJECTED',
        reason: new Error('Mux returned 401'),
      });
      actor.send({ type: 'EDIT' });
      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      await waitFor(
        actor,
        (s) =>
          s.matches({ rejected: 'editing' }) &&
          store.get(saveErrorAtom) !== null,
      );

      expect(store.get(rejectionAtom)).not.toBeNull();
      expect(store.get(saveErrorAtom)).toBe(
        "That key was refused by the provider. Check you copied it in full and that it hasn't been revoked.",
      );
      actor.stop();
    });

    it('drops the rejection when the key is removed elsewhere', () => {
      const { store, actor } = startConfigured();

      actor.send({ type: 'PROVIDER_REJECTED', reason: new Error('401') });
      expect(store.get(rejectionAtom)).not.toBeNull();

      actor.send({ type: 'LOADED', configured: false });

      expect(actor.getSnapshot().matches({ absent: 'idle' })).toBe(true);
      expect(store.get(rejectionAtom)).toBeNull();
      actor.stop();
    });
  });

  describe('isCredentialFormOpen', () => {
    it('stays true across a failed save so typed values survive', async () => {
      const { actor } = startConfigured(async () => {
        throw new Error('boom');
      });

      // Sampling after an await would miss the transient `saving` snapshot, so
      // record every transition instead.
      const seen: boolean[] = [];
      actor.subscribe((s) => seen.push(isCredentialFormOpen(s)));

      actor.send({ type: 'EDIT' });
      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      await waitFor(actor, (s) => s.matches({ configured: 'editing' }));

      // A single false in the middle is what would remount a consumer's form
      // and discard the admin's key.
      expect(seen.length).toBeGreaterThan(2);
      expect(seen.every(Boolean)).toBe(true);
      actor.stop();
    });

    it('is false in every settled state', () => {
      const { actor } = makeActor();
      actor.start();

      actor.send({ type: 'LOADED', configured: false });
      expect(isCredentialFormOpen(actor.getSnapshot())).toBe(false);

      actor.send({ type: 'LOADED', configured: true });
      expect(isCredentialFormOpen(actor.getSnapshot())).toBe(false);

      actor.send({ type: 'PROVIDER_REJECTED', reason: new Error('401') });
      expect(isCredentialFormOpen(actor.getSnapshot())).toBe(false);
      actor.stop();
    });

    it('reports saving only while a request is in flight', async () => {
      const { actor } = startConfigured();
      expect(isCredentialSaving(actor.getSnapshot())).toBe(false);

      actor.send({ type: 'EDIT' });
      actor.send({ type: 'SUBMIT', values: MUX_VALUES });
      expect(isCredentialSaving(actor.getSnapshot())).toBe(true);

      await waitFor(actor, (s) => s.matches({ configured: 'summary' }));
      expect(isCredentialSaving(actor.getSnapshot())).toBe(false);
      actor.stop();
    });
  });

  it('falls back to the setup form when the key is removed elsewhere', () => {
    const { actor } = startConfigured();

    actor.send({ type: 'LOADED', configured: false });

    expect(actor.getSnapshot().matches({ absent: 'idle' })).toBe(true);
    actor.stop();
  });
});
