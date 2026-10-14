// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ADMIN_PLAYER_FILES = [
  'src/components/admin/lesson-config/video-preview.tsx',
  'src/components/admin/lesson-config/video-section-container.tsx',
  'src/components/admin/lesson-video-modal-container.tsx',
];

describe('admin video previews', () => {
  it.each(
    ADMIN_PLAYER_FILES,
  )('%s never wires lesson progress (an admin watching must write no videos_progress)', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/use-milestone-reporter|useMilestoneReporter/);
    expect(src).not.toMatch(/LessonPlayerContainer|lesson-player-container/);
    expect(src).not.toMatch(/videoLanguageAtom|atoms\/video-language/);
  });
});
