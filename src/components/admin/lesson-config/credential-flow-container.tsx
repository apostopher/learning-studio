import { useMachine } from '@xstate/react';
import { useAtomValue, useStore } from 'jotai';
import { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  credentialKey,
  credentialRejectionAtomFamily,
  credentialSaveErrorAtomFamily,
} from '#/atoms/credential';
import { useDeleteCredential } from '#/data-hooks/use-delete-credential';
import { useSaveCredential } from '#/data-hooks/use-save-credential';
import type {
  CredentialSummary as CredentialSummaryData,
  SaveCredentialInput,
} from '#/lib/admin-schemas';
import { type ProviderId, VIDEO_PROVIDERS } from '#/lib/video-providers';
import {
  type CredentialValues,
  createCredentialImplementations,
  credentialMachine,
  isCredentialFormOpen,
  isCredentialSaving,
} from '#/machines/credential-machine';
import {
  buildCredentialFields,
  type CredentialFormValues,
} from './credential-fields';
import { CredentialNotConnected } from './credential-not-connected';
import { CredentialNotice } from './credential-notice';
import { CredentialSummary } from './credential-summary';
import { ProviderCredentialForm } from './provider-credential-form';
import { ProviderHowTo } from './provider-how-to';

interface CredentialFlowContainerProps {
  courseId: number;
  provider: ProviderId;
  /** This provider's stored credential, or undefined when none is configured. */
  summary: CredentialSummaryData | undefined;
  /**
   * True while the credentials query has no trustworthy answer yet — still
   * loading, or failed. `summary` is `undefined` in both cases, and treating a
   * failed query as "no key stored" would tell the admin they need to enter a
   * key they may already have.
   */
  isLoadingCredentials: boolean;
  /**
   * Stops the nested credential `<form>`'s submit event from bubbling into an
   * outer form. Needed because this row renders inside the course-edit dialog's
   * form; harmless when there is no outer form.
   */
  stopSubmitPropagation?: boolean;
  /**
   * Skip the "Not connected" step and open the setup form as soon as we know
   * there is no key. For the lesson Video tab, where the admin's task is
   * already blocked on the missing key — an extra click buys nothing there.
   *
   * Implies no Cancel button on the setup form: `absent.form` would only fall
   * back to `absent.idle`, which this prop immediately reopens.
   */
  openFormImmediately?: boolean;
  /**
   * Whether to offer removal. Off by default: deleting a credential affects
   * every lesson on the course, so it belongs on the course-edit dialog rather
   * than wherever a single lesson happens to surface this flow.
   */
  allowRemove?: boolean;
  /**
   * Human-readable reason the *stored* key was refused by the provider, or null.
   * Discovered by whoever attempted playback — this flow never probes on its own.
   * Delivered to the machine as `PROVIDER_REJECTED` once it is in a state that
   * accepts it, which flips the UI from "configured" to "enter a new key".
   */
  providerRejection?: string | null;
}

/**
 * Drives one course+provider credential flow with `credentialMachine`.
 *
 * Owns the actor, the react-hook-form instance, and the save/delete mutations;
 * renders only presentational components. The machine is the single source of
 * truth for *which* UI shows — server data enters through `LOADED`, never by
 * branching on the query result directly.
 *
 * Returns a bare fragment and brings no chrome of its own, so the course dialog
 * can wrap it in a `CredentialProviderRow` card while the lesson Video tab drops
 * it straight into an existing panel. Callers supply the surrounding layout.
 */
export const CredentialFlowContainer = ({
  courseId,
  provider,
  summary,
  isLoadingCredentials,
  stopSubmitPropagation = false,
  openFormImmediately = false,
  allowRemove = false,
  providerRejection = null,
}: CredentialFlowContainerProps) => {
  const store = useStore();
  const meta = VIDEO_PROVIDERS[provider];
  const atomKey = credentialKey(courseId, provider);

  const saveCredential = useSaveCredential(courseId);
  const deleteCredential = useDeleteCredential(courseId);

  // Stable dependency callback so the provided machine identity does not churn
  // (which would restart the actor and drop the flow). react-query's
  // mutateAsync is referentially stable, and provider/label are constant.
  //
  // The toast copy is deliberately neutral: distinguishing "connected" from
  // "updated" would mean closing over whether a key already existed, which
  // changes this callback's identity on every save and restarts the actor.
  const save = useCallback(
    async (values: CredentialValues) => {
      await saveCredential.mutateAsync({
        provider,
        ...values,
      } as SaveCredentialInput);
      toast.success(`${meta.label} key saved`);
    },
    [saveCredential.mutateAsync, provider, meta.label],
  );

  const machine = useMemo(
    () =>
      credentialMachine.provide(
        createCredentialImplementations({
          store,
          key: atomKey,
          saveCredential: save,
        }),
      ),
    [store, atomKey, save],
  );

  const [state, send] = useMachine(machine);

  const saveError = useAtomValue(credentialSaveErrorAtomFamily(atomKey));
  const rejection = useAtomValue(credentialRejectionAtomFamily(atomKey));

  // Feed server truth in as an event rather than branching on the query below,
  // so the machine stays the only thing that decides which UI is showing.
  const isConfigured = summary !== undefined;
  useEffect(() => {
    if (isLoadingCredentials) return;
    send({ type: 'LOADED', configured: isConfigured });
  }, [isLoadingCredentials, isConfigured, send]);

  // Skip straight past "Not connected" where the caller asked for it. Safe to
  // re-fire: `absent.form` has no Cancel under this prop, so nothing sends the
  // flow back to `idle` for this to fight with.
  const isAbsentIdle = state.matches({ absent: 'idle' });
  useEffect(() => {
    if (openFormImmediately && isAbsentIdle) send({ type: 'EDIT' });
  }, [openFormImmediately, isAbsentIdle, send]);

  // Gated on `configured.summary` because that is the only state accepting
  // PROVIDER_REJECTED, and the rejection is usually known *before* the
  // credentials query settles. Keying the effect on arrival at that state is
  // what makes the event land instead of being dropped while still `loading`.
  const isConfiguredSummary = state.matches({ configured: 'summary' });
  useEffect(() => {
    if (providerRejection && isConfiguredSummary) {
      send({ type: 'PROVIDER_REJECTED', reason: providerRejection });
    }
  }, [providerRejection, isConfiguredSummary, send]);

  const credentialForm = useForm<CredentialFormValues>({ mode: 'onSubmit' });

  // Resets on the closed→open edge only. `isCredentialFormOpen` stays true
  // through `saving`, so a failed save returns to `editing` without this
  // clearing the key the admin just typed — see the helper's own comment.
  const isFormOpen = isCredentialFormOpen(state);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed only on the open/closed edge — credentialForm's identity is stable, and adding it would not change when this runs.
  useEffect(() => {
    if (isFormOpen) credentialForm.reset();
  }, [isFormOpen]);

  const handleSubmit = credentialForm.handleSubmit((values) => {
    // Credential fields differ per provider, so the schema is chosen at
    // runtime — there's no single static type to hand to zodResolver here.
    // Validate manually with the provider's own client-safe schema instead.
    const parsed = meta.credentialSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          credentialForm.setError(field as keyof CredentialFormValues, {
            message: issue.message,
          });
        }
      }
      return;
    }
    send({ type: 'SUBMIT', values: parsed.data as CredentialValues });
  });

  const handleRemove = () => {
    deleteCredential.mutate(provider, {
      onSuccess: () => toast.success(`${meta.label} disconnected`),
      onError: () => toast.error(`Couldn't remove ${meta.label}`),
    });
  };

  const renderCredentialForm = (canCancel: boolean) => (
    <ProviderCredentialForm
      fields={buildCredentialFields(provider, credentialForm)}
      onSubmit={
        stopSubmitPropagation
          ? (e) => {
              e.stopPropagation();
              handleSubmit(e);
            }
          : handleSubmit
      }
      serverError={saveError ?? undefined}
      isPending={isCredentialSaving(state)}
      submitLabel={isConfigured ? 'Update key' : 'Save key'}
      onCancel={canCancel ? () => send({ type: 'CANCEL' }) : undefined}
    />
  );

  const summaryNode = summary && (
    <CredentialSummary
      display={summary.display}
      lastSavedAt={summary.lastValidatedAt}
      onUpdate={() => send({ type: 'EDIT' })}
      onRemove={allowRemove ? handleRemove : undefined}
      isRemoving={deleteCredential.isPending}
    />
  );

  return (
    <>
      {state.matches({ absent: 'idle' }) && !openFormImmediately && (
        <CredentialNotConnected onConnect={() => send({ type: 'EDIT' })} />
      )}

      {(state.matches({ absent: 'form' }) ||
        state.matches({ absent: 'saving' })) && (
        <>
          <ProviderHowTo provider={provider} />
          {renderCredentialForm(!openFormImmediately)}
        </>
      )}

      {state.matches({ configured: 'summary' }) && summaryNode}

      {(state.matches({ configured: 'editing' }) ||
        state.matches({ configured: 'saving' }) ||
        state.matches({ rejected: 'editing' }) ||
        state.matches({ rejected: 'saving' })) && (
        <>
          <CredentialNotice tone="info">
            A key is already saved for this course. Saving a new one replaces it
            — the existing key can't be shown again.
          </CredentialNotice>
          {renderCredentialForm(true)}
        </>
      )}

      {state.matches({ rejected: 'notice' }) && (
        <>
          {summaryNode}
          <CredentialNotice tone="error">
            {rejection ??
              'The stored key is no longer accepted by the provider. Enter a new key to restore playback.'}
          </CredentialNotice>
        </>
      )}
    </>
  );
};
