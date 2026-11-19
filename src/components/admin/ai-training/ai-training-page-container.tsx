import { getRouteApi } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  AI_TRAINING_SECTIONS,
  type AiTrainingSectionId,
  aiTrainingSearchSchema,
  DEFAULT_AI_TRAINING_SECTION,
} from '#/lib/ai-training-sections';
import { PersonaSectionContainer } from '../persona/persona-section-container';
import { AiTrainingPage } from './ai-training-page';
import { DocumentsSectionContainer } from './documents-section-container';
import { PreviewChatContainer } from './preview-chat-container';

// `getRouteApi`, not an import of `Route`: the route module imports this
// container, so importing it back would be a cycle.
const adminRoute = getRouteApi('/_authed/admin/');

/**
 * The AI Training tab. The inner section lives in `?trainingSection=` so it
 * is shareable and survives a reload.
 *
 * Read from the RENDERED match's search, not nuqs: nuqs reads `useLocation()`,
 * which jumps to the destination the moment a navigation starts and once
 * swapped a still-mounted admin screen for the wrong one (2026-11-18).
 */
export const AiTrainingPageContainer = () => {
  const search = adminRoute.useSearch();
  const navigate = adminRoute.useNavigate();
  const active =
    aiTrainingSearchSchema.parse(search).trainingSection ??
    DEFAULT_AI_TRAINING_SECTION;

  // What each inner section renders. Sessions is added by later work
  // (`SessionsSectionContainer`); until then it renders nothing. Elements,
  // not mounted components: only the active one reaches the tree.
  const content: Record<AiTrainingSectionId, ReactNode> = {
    documents: <DocumentsSectionContainer />,
    persona: <PersonaSectionContainer />,
    chat: <PreviewChatContainer />,
    sessions: null,
  };

  return (
    <AiTrainingPage
      sections={AI_TRAINING_SECTIONS}
      active={active}
      onSelect={(trainingSection) =>
        navigate({ search: (prev) => ({ ...prev, trainingSection }) })
      }
    >
      {content[active]}
    </AiTrainingPage>
  );
};
