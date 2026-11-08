import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Tests assert the real 12-hour debrief delay. A developer's local override
// (VITE_DEBRIEF_DELAY_MINUTES=1 in .env.local, for trying the debrief by hand)
// must not leak in. Runs before each test file's imports, so the module
// constant in debrief-schedule.ts sees the unset value.
vi.stubEnv('VITE_DEBRIEF_DELAY_MINUTES', '');

afterEach(() => {
  cleanup();
});
