/**
 * Whether a message to Viper is one of the learner's open debrief questions:
 * pasted, or retyped closely enough to be the same question. A learner
 * pasted one into Viper and was handed the answer (2026-11-13).
 *
 * Deliberately lexical, and tuned to catch copies rather than topics: a
 * learner asking about the same subject in their own words must still get
 * help. Rewordings this misses are left to Viper's prompt, which lists the
 * open questions and tells it not to answer them (`openDebriefQuestionsPrompt`).
 */

/** Share of a question's content words that, all present, make a copy. */
const COVERAGE_THRESHOLD = 0.6;
/** Below this many content words, only a verbatim copy counts. */
const MIN_CONTENT_WORDS = 4;

const STOPWORDS = new Set([
  'about',
  'and',
  'are',
  'but',
  'can',
  'could',
  'did',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'her',
  'his',
  'how',
  'its',
  'not',
  'our',
  'should',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'they',
  'this',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'youd',
  'youll',
  'youre',
  'youve',
  'your',
]);

/**
 * Lowercase words, apostrophes and hyphens closed up ("non-standard" →
 * "nonstandard", "you've" → "youve"), everything else a separator.
 */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’-]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const isContent = (w: string) => w.length >= 3 && !STOPWORDS.has(w);

export function matchesOpenDebriefQuestion(
  message: string,
  openQuestions: readonly string[],
): boolean {
  const messageWords = words(message);
  const joined = ` ${messageWords.join(' ')} `;
  // Adjacent pairs closed up too, so "time critical" matches "time-critical".
  const present = new Set(messageWords);
  for (let i = 1; i < messageWords.length; i++) {
    present.add(messageWords[i - 1] + messageWords[i]);
  }

  return openQuestions.some((question) => {
    const questionWords = words(question);
    if (questionWords.length === 0) return false;
    if (joined.includes(` ${questionWords.join(' ')} `)) return true;
    const content = [...new Set(questionWords.filter(isContent))];
    if (content.length < MIN_CONTENT_WORDS) return false;
    const covered = content.filter((w) => present.has(w)).length;
    return covered / content.length >= COVERAGE_THRESHOLD;
  });
}
