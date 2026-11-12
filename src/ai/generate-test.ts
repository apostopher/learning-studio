import { generateText, Output } from 'ai';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { haiku, sonnet } from './ai-provider';
import { evaluatorPrompt } from './prompts/evaluator';
import { generationPrompt, type QuestionSlot } from './prompts/generation';
import { optimizerPrompt } from './prompts/optimizer';
import {
  AITestGenerationOutputSchema,
  type ChunkedFreeTextQuestion,
  type EvaluatorOutput,
  EvaluatorOutputSchema,
} from './schemas';

const MAX_RETRIES = 2;

type Ctx = {
  chunks: KnowledgeChunk[];
  context: string;
  slots: QuestionSlot[];
  avoidQuestions: string[];
};

async function generate(ctx: Ctx): Promise<ChunkedFreeTextQuestion[]> {
  const { output } = await generateText({
    model: sonnet,
    output: Output.object({ schema: AITestGenerationOutputSchema }),
    prompt: generationPrompt({
      chunks: ctx.chunks,
      slots: ctx.slots,
      text: ctx.context,
      avoidQuestions: ctx.avoidQuestions,
    }),
  });
  return output.questions;
}

async function evaluate(
  ctx: Ctx,
  questions: ChunkedFreeTextQuestion[],
): Promise<EvaluatorOutput> {
  const { output } = await generateText({
    model: haiku,
    output: Output.object({ schema: EvaluatorOutputSchema }),
    prompt: evaluatorPrompt({
      chunks: ctx.chunks,
      text: ctx.context,
      questions,
    }),
  });
  return output;
}

async function optimize(
  ctx: Ctx,
  failedQuestions: ChunkedFreeTextQuestion[],
  slotByQuestionId: Record<string, QuestionSlot>,
  evaluatorFeedback: EvaluatorOutput['results'],
): Promise<ChunkedFreeTextQuestion[]> {
  const { output } = await generateText({
    model: sonnet,
    output: Output.object({ schema: AITestGenerationOutputSchema }),
    prompt: optimizerPrompt({
      chunks: ctx.chunks,
      slotByQuestionId,
      avoidQuestions: ctx.avoidQuestions,
      text: ctx.context,
      failedQuestions,
      evaluatorFeedback,
    }),
  });
  return output.questions;
}

/** Ids are ours, not the model's: `q1..qN` by slot order. */
const withSlotIds = (questions: ChunkedFreeTextQuestion[]) =>
  questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));

/**
 * A debrief: one written question per slot, the pilot's holes first and then
 * the spaced-review chunks. Each question's `chunkIds[0]` is its slot's chunk.
 *
 * Generate with Sonnet, quality-check with Haiku, regenerate failures with
 * Sonnet (at most twice). A regenerated question takes its original's slot.
 * Afterwards code checks the tagging itself — a question whose focus chunk is
 * not its slot's, or that cites an unknown chunk, gets one more optimise call,
 * and if it is still wrong its tags are overwritten with `[slotChunkId]`. A
 * slot is never dropped.
 */
export async function generateTest(input: {
  lessonSlug: string;
  chunks: KnowledgeChunk[];
  context: string;
  focus: { holes: string[]; review: string[] };
  avoidQuestions: string[];
}): Promise<{
  lessonSlug: string;
  questions: ChunkedFreeTextQuestion[];
}> {
  const { lessonSlug, chunks, context, focus, avoidQuestions } = input;
  const slots: QuestionSlot[] = [
    ...focus.holes.map((chunkId) => ({ chunkId, kind: 'hole' as const })),
    ...focus.review.map((chunkId) => ({ chunkId, kind: 'review' as const })),
  ];
  const ctx: Ctx = { chunks, context, slots, avoidQuestions };
  const slotCount = slots.length;
  if (slotCount === 0) return { lessonSlug, questions: [] };

  const generated = await generate(ctx);
  if (generated.length < slotCount) {
    // A hole without a question would be skipped silently; refuse instead.
    throw new Error(
      `Question generation returned ${generated.length} of ${slotCount} questions`,
    );
  }
  const questions = withSlotIds(generated.slice(0, slotCount));

  /** Regenerate the questions at `indexes`, each back into its own slot. */
  const regenerate = async (
    indexes: number[],
    feedback: EvaluatorOutput['results'],
  ) => {
    const failed = indexes.map((i) => questions[i]);
    const slotByQuestionId = Object.fromEntries(
      indexes.map((i) => [questions[i].id, slots[i]]),
    );
    const regenerated = await optimize(ctx, failed, slotByQuestionId, feedback);
    // In order, one for one; a failure the optimiser returned nothing for
    // keeps its original rather than shrinking the debrief.
    indexes.forEach((slot, n) => {
      const r = regenerated[n];
      if (r) questions[slot] = { ...r, id: questions[slot].id };
    });
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { results } = await evaluate(ctx, questions);
    const failing = results.filter((r) => !r.pass);
    const failedIds = new Set(failing.map((r) => r.questionId));
    if (failedIds.size === 0) break;
    await regenerate(
      questions.flatMap((q, i) => (failedIds.has(q.id) ? [i] : [])),
      failing,
    );
  }

  const known = new Set(chunks.map((c) => c.id));
  const problem = (q: ChunkedFreeTextQuestion, i: number): string | null => {
    const unknown = q.chunkIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return `Cites unknown chunk id(s) ${unknown.join(', ')}; use only ids from the Knowledge Chunks list.`;
    }
    if (new Set(q.chunkIds).size !== q.chunkIds.length) {
      return `chunkIds repeats an id (${q.chunkIds.join(', ')}); list each chunk once.`;
    }
    if (q.chunkIds[0] !== slots[i].chunkId) {
      return `chunkIds[0] is \`${q.chunkIds[0]}\` but this slot's focus chunk is \`${slots[i].chunkId}\`; it must come first and the question must test it.`;
    }
    return null;
  };
  const badSlots = () =>
    questions.flatMap((q, i) => (problem(q, i) ? [i] : []));

  const bad = badSlots();
  if (bad.length > 0) {
    await regenerate(
      bad,
      bad.map((i) => ({
        questionId: questions[i].id,
        pass: false,
        reason: problem(questions[i], i) ?? '',
      })),
    );
    for (const i of badSlots()) {
      questions[i] = { ...questions[i], chunkIds: [slots[i].chunkId] };
    }
  }

  return { lessonSlug, questions };
}
