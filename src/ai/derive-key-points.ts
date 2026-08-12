import { generateText, Output } from 'ai';
import { z } from 'zod';
import { haiku } from './ai-provider';

/**
 * The debrief generator is built around key points: it asks for two questions
 * per point and tags every question with a `keyPointIndex`. A lesson with no
 * material row has no authored points, so they are derived from the video
 * transcript here rather than weakening the generation prompt — every prompt
 * downstream keeps working on exactly the shape it was written for.
 *
 * Haiku, not Sonnet: this is extraction, not composition, and it sits in front
 * of a Sonnet generation call the learner is already waiting on.
 */
const KEY_POINTS_MAX = 8;

const DeriveOutputSchema = z.object({
  keyPoints: z
    .array(z.string())
    .min(1)
    .max(KEY_POINTS_MAX)
    .describe('The teachable points of the lesson, most important first'),
});

/** Transcripts run long; this is comfortably more than a 30-minute lesson. */
const MAX_TRANSCRIPT_CHARS = 60_000;

export async function deriveKeyPoints(transcript: string): Promise<string[]> {
  const { output } = await generateText({
    model: haiku,
    output: Output.object({ schema: DeriveOutputSchema }),
    prompt: `You are an aviation training editor. Below is the transcript of one lesson video.

Extract between 3 and ${KEY_POINTS_MAX} key points — the things a student is meant to take away from this lesson. Write each as a single self-contained statement of fact or procedure, in the same terminology the instructor uses. Order them most important first.

Do not include greetings, course admin, or references to other lessons. If the transcript is too thin to support three points, return only the points it genuinely supports.

## Transcript
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`,
  });

  return output.keyPoints.map((point) => point.trim()).filter(Boolean);
}
