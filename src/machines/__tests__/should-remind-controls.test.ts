import { describe, expect, it } from 'vitest';
import {
  CONTROLS_REMINDER_COOLDOWN_TURNS,
  HESITANCY_TURN_THRESHOLD,
  LONG_CONVERSATION_MINUTES,
  shouldRemindControls,
} from '#/machines/onboarding-machine';

const ctx = (
  over: Partial<Parameters<typeof shouldRemindControls>[0]> = {},
) => ({
  turnCount: 0,
  elapsedMinutes: 0,
  hesitancyFlagged: false,
  lastRemindedTurn: null,
  ...over,
});

describe('shouldRemindControls — quiet early on', () => {
  it('does not remind at the start of a conversation', () => {
    expect(shouldRemindControls(ctx())).toBe(false);
  });

  it('does not remind just below both thresholds', () => {
    expect(
      shouldRemindControls(
        ctx({
          turnCount: HESITANCY_TURN_THRESHOLD - 1,
          elapsedMinutes: LONG_CONVERSATION_MINUTES - 1,
        }),
      ),
    ).toBe(false);
  });
});

describe('shouldRemindControls — hesitancy', () => {
  it('reminds whenever hesitancy is flagged, even in a short conversation', () => {
    expect(shouldRemindControls(ctx({ hesitancyFlagged: true }))).toBe(true);
  });

  it('is NOT suppressed by the cooldown', () => {
    // Hesitancy is a direct response to something the trainee just did, and is
    // already fire-once by construction (the evaluator sets the flag, the turn
    // that carries the reminder clears it). Cooling it down would swallow a
    // reassurance the trainee actively needs.
    expect(
      shouldRemindControls(
        ctx({ hesitancyFlagged: true, turnCount: 20, lastRemindedTurn: 20 }),
      ),
    ).toBe(true);
  });
});

describe('shouldRemindControls — long conversation does not latch', () => {
  it('reminds when the turn threshold is first crossed', () => {
    expect(
      shouldRemindControls(ctx({ turnCount: HESITANCY_TURN_THRESHOLD })),
    ).toBe(true);
  });

  it('goes quiet on the very next turn', () => {
    // THE bug this function exists to prevent. `turnCount` only ever
    // increases, so a bare `turnCount >= THRESHOLD` is true for every
    // remaining turn — the agent re-stated the controls before every single
    // question from roughly Q5 onward.
    expect(
      shouldRemindControls(
        ctx({
          turnCount: HESITANCY_TURN_THRESHOLD + 1,
          lastRemindedTurn: HESITANCY_TURN_THRESHOLD,
        }),
      ),
    ).toBe(false);
  });

  it('stays quiet for the whole cooldown', () => {
    for (let i = 1; i < CONTROLS_REMINDER_COOLDOWN_TURNS; i++) {
      expect(
        shouldRemindControls(
          ctx({
            turnCount: HESITANCY_TURN_THRESHOLD + i,
            lastRemindedTurn: HESITANCY_TURN_THRESHOLD,
          }),
        ),
        `turn +${i} after a reminder`,
      ).toBe(false);
    }
  });

  it('re-offers once the cooldown has fully elapsed', () => {
    // The doc says "repeat this option briefly" — so it must come back, just
    // not immediately.
    expect(
      shouldRemindControls(
        ctx({
          turnCount:
            HESITANCY_TURN_THRESHOLD + CONTROLS_REMINDER_COOLDOWN_TURNS,
          lastRemindedTurn: HESITANCY_TURN_THRESHOLD,
        }),
      ),
    ).toBe(true);
  });

  it('never fires on two consecutive turns across a long interview', () => {
    // Simulates the reported symptom directly: walk 40 turns, delivering the
    // reminder whenever the function says to, and assert it never lands twice
    // in a row.
    let lastRemindedTurn: number | null = null;
    const fired: number[] = [];
    for (let turnCount = 0; turnCount < 40; turnCount++) {
      if (shouldRemindControls(ctx({ turnCount, lastRemindedTurn }))) {
        fired.push(turnCount);
        lastRemindedTurn = turnCount;
      }
    }
    expect(fired.length).toBeGreaterThan(1); // it does still repeat
    const gaps = fired.slice(1).map((turn, i) => turn - (fired[i] ?? turn));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(
      CONTROLS_REMINDER_COOLDOWN_TURNS,
    );
  });
});

describe('shouldRemindControls — elapsed time', () => {
  it('reminds on the ten-minute mark even when few turns have happened', () => {
    // docs/onboarding.md keys the re-offer on minutes, not turns. A trainee
    // writing long, considered answers can be twelve minutes in after four
    // turns.
    expect(
      shouldRemindControls(
        ctx({ turnCount: 4, elapsedMinutes: LONG_CONVERSATION_MINUTES }),
      ),
    ).toBe(true);
  });

  it('does not remind before the ten-minute mark on turns alone', () => {
    expect(
      shouldRemindControls(
        ctx({ turnCount: 4, elapsedMinutes: LONG_CONVERSATION_MINUTES - 1 }),
      ),
    ).toBe(false);
  });

  it('cools down the time trigger too, so a slow conversation is not nagged', () => {
    // Elapsed minutes only increase, so without the cooldown this latches
    // exactly like turnCount did.
    expect(
      shouldRemindControls(
        ctx({
          turnCount: 5,
          elapsedMinutes: LONG_CONVERSATION_MINUTES + 30,
          lastRemindedTurn: 5,
        }),
      ),
    ).toBe(false);
  });
});
