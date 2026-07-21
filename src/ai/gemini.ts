import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '#/env';

/** Google Generative AI provider (Gemini). */
export const googleProvider = createGoogleGenerativeAI({
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/**
 * gemini-embedding-001 → 3072-dim vectors. This MUST match the model that
 * produced the existing `docs` rows; embeddings from other models are not
 * comparable in the same vector space.
 */
export const embeddingModel = googleProvider.embeddingModel(
  'gemini-embedding-001',
);
