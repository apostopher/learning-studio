import { generateText, Output } from 'ai';
// Relative path, not `@/` — this repo's vitest does not resolve the `@/`
// tsconfig-paths alias (see resolve.server.test.ts precedent).
import type { LessonMaterialGeneration } from '../types';
import { LessonMaterialGenerationSchema } from '../types';
import { haiku } from './ai-provider';
import {
  lessonMaterialSystemPrompt,
  lessonMaterialUserPrompt,
} from './prompts/lesson-material';

/**
 * Turn a lesson document's HTML into structured lesson material using Haiku via
 * the Vercel AI Gateway. Output is validated against the schema by the AI SDK's
 * structured-output mode.
 */
export async function generateLessonMaterial(
  html: string,
): Promise<LessonMaterialGeneration> {
  const { output } = await generateText({
    model: haiku,
    output: Output.object({ schema: LessonMaterialGenerationSchema }),
    system: lessonMaterialSystemPrompt,
    prompt: lessonMaterialUserPrompt(html),
  });
  return output;
}
