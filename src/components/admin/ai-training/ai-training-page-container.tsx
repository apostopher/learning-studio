import { getRouteApi } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  type AiTrainingSectionId,
  aiTrainingSearchSchema,
  DEFAULT_AI_TRAINING_SECTION,
  VISIBLE_AI_TRAINING_SECTIONS,
} from '#/lib/ai-training-sections';
import { PersonaSectionContainer } from '../persona/persona-section-container';
import { AiTrainingPage } from './ai-training-page';
import { DocumentsSectionContainer } from './documents-section-container';
import { PreviewChatContainer } from './preview-chat-container';
import { SessionsSectionContainer } from './sessions-section-container';

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

  // What each inner section renders. Elements, not mounted components: only
  // the active one reaches the tree.
  const content: Record<AiTrainingSectionId, ReactNode> = {
    documents: <DocumentsSectionContainer />,
    persona: <PersonaSectionContainer />,
    chat: <PreviewChatContainer />,
    sessions: <SessionsSectionContainer />,
  };

  return (
    <AiTrainingPage
      sections={VISIBLE_AI_TRAINING_SECTIONS}
      active={active}
      onSelect={(trainingSection) =>
        navigate({ search: (prev) => ({ ...prev, trainingSection }) })
      }
    >
      {content[active]}
    </AiTrainingPage>
  );
};
