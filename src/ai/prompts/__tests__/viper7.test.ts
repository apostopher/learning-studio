import { describe, expect, it } from 'vitest';
import { viper7SystemPrompt } from '#/ai/prompts/viper7';

describe('viper7SystemPrompt', () => {
  it('injects user name/callsign and roles when provided', () => {
    const s = viper7SystemPrompt({
      isAssociate: false,
      userInfo: {
        name: 'Rahul',
        callSign: 'cooker',
        location: 'Perth',
        userRoles: ['instructor'],
      },
    });
    expect(s).toContain('cooker');
    expect(s.toLowerCase()).toContain('instructor');
  });

  it('produces a non-empty prompt with no userInfo', () => {
    expect(viper7SystemPrompt({ isAssociate: true }).length).toBeGreaterThan(
      50,
    );
  });
});
