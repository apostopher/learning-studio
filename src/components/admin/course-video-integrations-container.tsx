import { useMemo } from 'react';

import { useCourseCredentials } from '#/data-hooks/use-course-credentials';
import type { CredentialSummary } from '#/lib/admin-schemas';
import {
  PROVIDER_IDS,
  type ProviderId,
  VIDEO_PROVIDERS,
} from '#/lib/video-providers';
import { CredentialFlowContainer } from './lesson-config/credential-flow-container';
import { CredentialProviderRow } from './lesson-config/credential-provider-row';

interface CourseVideoIntegrationsContainerProps {
  courseId: number;
}

/**
 * "Video integrations" section of the course edit dialog: one credential flow
 * per known video provider. Owns the credentials query and hands each provider
 * its own summary; every row drives its own `credentialMachine` actor.
 *
 * The durable place to rotate provider keys, independent of any one lesson.
 */
export const CourseVideoIntegrationsContainer = ({
  courseId,
}: CourseVideoIntegrationsContainerProps) => {
  const credentials = useCourseCredentials(courseId);

  const credentialsByProvider = useMemo(() => {
    const map = new Map<ProviderId, CredentialSummary>();
    for (const summary of credentials.data ?? []) {
      map.set(summary.provider, summary);
    }
    return map;
  }, [credentials.data]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-primary text-sm">
        Video integrations
      </span>
      <p className="text-tertiary text-xs">
        Connect provider credentials so lesson videos can be resolved and
        played. Keys are stored encrypted and never shown again — only an
        identifying fragment.
      </p>

      <div className="mt-1 flex flex-col gap-2">
        {PROVIDER_IDS.map((providerId) => {
          // A failed query also means "we don't know", not "no key" — a row
          // must not claim Not connected on the strength of missing data.
          const isUnknown = credentials.isLoading || credentials.isError;
          return (
            <CredentialProviderRow
              key={providerId}
              label={VIDEO_PROVIDERS[providerId].label}
              isLoading={isUnknown}
            >
              <CredentialFlowContainer
                courseId={courseId}
                provider={providerId}
                summary={credentialsByProvider.get(providerId)}
                isLoadingCredentials={isUnknown}
                // This section renders inside the course-edit <form> (via the
                // videoIntegrations slot in create-course-form.tsx), and a
                // nested form's native submit event bubbles even through
                // React's synthetic tree — so the row must stop it reaching
                // updateCourse.mutate.
                stopSubmitPropagation
                // The durable place to rotate or drop a course's keys.
                allowRemove
              />
            </CredentialProviderRow>
          );
        })}
      </div>

      {credentials.isError && (
        <p role="alert" className="text-error-text text-sm">
          Couldn't load video integrations.
        </p>
      )}
    </div>
  );
};
