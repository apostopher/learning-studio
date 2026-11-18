# Debrief: key-point sets with feedback after each answer

Date: 2026-11-18. Supersedes the pass rule, the attempt focus and the
spaced-review mix in `2026-11-12-debrief-knowledge-chunks-design.md`. Chunks,
grading and mastery storage are unchanged.

## Rules (user, 2026-11-18)

- Questions come only from the lesson's key points. Chunk generation makes
  exactly one chunk per key point, with no transcript-only extras
  (`CHUNKS_FORMAT` v3, so every lesson's chunks regenerate lazily).
- An attempt draws up to 8 different key points at random
  (`drawAttemptKeyPoints`). On a retake: missed (latest score under 75)
  first, then never asked, then the rest, each group shuffled.
- The draw is cut into sets of 4 (`splitIntoSets`). A lesson with 5 key
  points has a set of 4 and a set of 1; one with 4 or fewer has a single set.
- Viper's feedback appears after every answer: a verdict (Strong / Mostly
  there / Partly / Missed), the score, and 1–3 sentences (the grader's new
  `feedback` field, always written). The pilot presses Next. Nothing advances
  on its own.
- A set whose answers average 75 or more passes the debrief: a permanent
  pass, and the attempt ends (`set-passed`). Each set is judged on its own.
- A set under 75 opens the next set. Its questions stay on the server until
  then. The last set under 75 ends the attempt (`sets-missed`), and the
  retake follows the existing wait rules with a fresh draw.
- A pass comes only from a set. Clearing every chunk no longer passes, and a
  chunk regeneration's carry-over never records one.

## Storage

- No migration. `lesson_test_results.questions` gains `sets: string[][]`.
  `finished_reason` (text) gains `set-passed` and `sets-missed`. The older
  values are still read. `total_score` = the average of the set that ended
  the attempt.
- An attempt opened before the deploy has no `sets` and counts as one set of
  all its questions.
- `DEBRIEF_ATTEMPT_FORMAT` is unchanged, because the one-open-attempt index
  is built from it. Prepared tests are retired by `PREPARED_FORMAT` in their
  fingerprint instead. The fingerprint covers the chunk version and the
  pilot's mastery, because the draw is random.

## Flow (client)

```text
question → Submit → feedback card (verdict · score, Viper's words,
  the question and answer, set result if the set is done)
  → Next question | Start set 2 | See your result → report
```

The report shows each completed set's average against 75. The retake wait
keeps it via the status route's `lastAttempt: { score, setAverages }`.
