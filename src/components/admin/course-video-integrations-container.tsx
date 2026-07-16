import { useAtom } from 'jotai';
import { CheckCircle2, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { expandedVideoProviderAtom } from '@/atoms/admin';
import { useCourseCredentials } from '@/data-hooks/use-course-credentials';
import { useDeleteCredential } from '@/data-hooks/use-delete-credential';
import { useSaveCredential } from '@/data-hooks/use-save-credential';
import type {
  CredentialSummary,
  SaveCredentialInput,
} from '@/lib/admin-schemas';
import { cn } from '@/lib/cn';
import {
  PROVIDER_IDS,
  type ProviderId,
  VIDEO_PROVIDERS,
} from '@/lib/video-providers';
import {
  type CredentialField,
  ProviderCredentialForm,
} from './lesson-config/provider-credential-form';
import { ProviderHowTo } from './lesson-config/provider-how-to';

/** Superset of every provider's credential fields — RHF only registers the ones a given provider actually renders. */
interface CredentialFormValues {
  keyId?: string;
  privateKey?: string;
  apiKey?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Turns `{ apiKeyLast4: '1234' }` into "Api key last4: 1234" for display — generic across providers. */
function formatDisplay(display: Record<string, unknown>): string {
  return Object.entries(display)
    .map(([key, value]) => {
      const label = key
        .replace(/([A-Z0-9]+)/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      return `${label}: ${String(value)}`;
    })
    .join(' · ');
}

interface CourseVideoIntegrationsContainerProps {
  courseId: number;
}

/**
 * "Video integrations" section of the course edit dialog: lists every known
 * video provider, shows whether the course has stored credentials for it
 * (secret-free display only), and lets the admin add/update or remove them.
 * The durable place to rotate provider keys, independent of any one lesson.
 */
export const CourseVideoIntegrationsContainer = ({
  courseId,
}: CourseVideoIntegrationsContainerProps) => {
  const credentials = useCourseCredentials(courseId);
  const [expandedProvider, setExpandedProvider] = useAtom(
    expandedVideoProviderAtom,
  );
  const saveCredential = useSaveCredential(courseId);
  const deleteCredential = useDeleteCredential(courseId);

  // Collapse any open form whenever the dialog is pointed at a different course.
  // biome-ignore lint/correctness/useExhaustiveDependencies: courseId intentionally re-triggers the reset on course switch even though setExpandedProvider's identity is stable.
  useEffect(() => {
    setExpandedProvider(null);
  }, [courseId]);

  const credentialsByProvider = useMemo(() => {
    const map = new Map<ProviderId, CredentialSummary>();
    for (const summary of credentials.data ?? []) {
      map.set(summary.provider, summary);
    }
    return map;
  }, [credentials.data]);

  const credentialForm = useForm<CredentialFormValues>({ mode: 'onSubmit' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed only on expandedProvider — clears stale values from a previously-expanded provider's fields when the selection changes; credentialForm's identity is stable across renders.
  useEffect(() => {
    credentialForm.reset();
    saveCredential.reset();
  }, [expandedProvider]);

  const handleCredentialSubmit = credentialForm.handleSubmit((values) => {
    if (!expandedProvider) return;
    // Credential fields differ per provider, so the schema is chosen at
    // runtime — there's no single static type to hand to zodResolver here.
    // Validate manually with the provider's own client-safe schema instead.
    const parsed =
      VIDEO_PROVIDERS[expandedProvider].credentialSchema.safeParse(values);
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
    saveCredential.mutate(
      {
        provider: expandedProvider,
        ...(parsed.data as CredentialFormValues),
      } as SaveCredentialInput,
      {
        onSuccess: () => {
          toast.success(`${VIDEO_PROVIDERS[expandedProvider].label} connected`);
          setExpandedProvider(null);
        },
      },
    );
  });

  const credentialFields: CredentialField[] = useMemo(() => {
    if (expandedProvider === 'mux') {
      return [
        {
          name: 'keyId',
          label: 'Signing key ID',
          type: 'text',
          register: credentialForm.register('keyId'),
          error: credentialForm.formState.errors.keyId?.message,
        },
        {
          name: 'privateKey',
          label: 'Signing key (private, Base64)',
          type: 'password',
          register: credentialForm.register('privateKey'),
          error: credentialForm.formState.errors.privateKey?.message,
        },
      ];
    }
    if (expandedProvider === 'synthesia') {
      return [
        {
          name: 'apiKey',
          label: 'API key',
          type: 'password',
          register: credentialForm.register('apiKey'),
          error: credentialForm.formState.errors.apiKey?.message,
        },
      ];
    }
    return [];
  }, [expandedProvider, credentialForm]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-gray-12 text-sm">
        Video integrations
      </span>
      <p className="text-gray-10 text-xs">
        Connect provider credentials so lesson videos can be resolved and
        played. Keys are stored encrypted and never shown again — only an
        identifying fragment.
      </p>

      <div className="mt-1 flex flex-col gap-2">
        {PROVIDER_IDS.map((providerId) => {
          const meta = VIDEO_PROVIDERS[providerId];
          const summary = credentialsByProvider.get(providerId);
          const isConfigured = summary !== undefined;
          const isExpanded = expandedProvider === providerId;
          const isDeleting =
            deleteCredential.isPending &&
            deleteCredential.variables === providerId;

          return (
            <div
              key={providerId}
              className="flex flex-col rounded-lg border border-gray-6 bg-gray-1"
            >
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedProvider(isExpanded ? null : providerId)
                  }
                  aria-expanded={isExpanded}
                  className="flex flex-1 items-center gap-3 text-start"
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-gray-10 transition-transform duration-150',
                      isExpanded && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-medium text-gray-12 text-sm">
                      {meta.label}
                    </span>
                    {isConfigured ? (
                      <span className="inline-flex items-center gap-1.5 text-green-11 text-xs">
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {formatDisplay(summary.display)}
                        {summary.lastValidatedAt && (
                          <span className="text-gray-10">
                            · verified{' '}
                            {dateTimeFormatter.format(summary.lastValidatedAt)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-10 text-xs">
                        Not connected
                      </span>
                    )}
                  </div>
                </button>

                {isConfigured && (
                  <button
                    type="button"
                    onClick={() =>
                      deleteCredential.mutate(providerId, {
                        onSuccess: () =>
                          toast.success(`${meta.label} disconnected`),
                        onError: () =>
                          toast.error(`Couldn't remove ${meta.label}`),
                      })
                    }
                    disabled={isDeleting}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-red-11 text-xs',
                      'transition-colors hover:bg-red-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-9',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                  >
                    {isDeleting ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Remove
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="flex flex-col gap-4 border-gray-6 border-t p-4">
                  <ProviderHowTo provider={providerId} />
                  <ProviderCredentialForm
                    fields={credentialFields}
                    onSubmit={handleCredentialSubmit}
                    serverError={saveCredential.error?.message}
                    isPending={saveCredential.isPending}
                    submitLabel={
                      isConfigured ? 'Update credentials' : 'Save credentials'
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {credentials.isError && (
        <p role="alert" className="text-red-11 text-sm">
          Couldn't load video integrations.
        </p>
      )}
    </div>
  );
};
