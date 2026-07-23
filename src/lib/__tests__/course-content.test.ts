import { describe, expect, it } from 'vitest';
import { courseContentToHtml } from '#/lib/course-content';

describe('courseContentToHtml', () => {
  it('renders course → modules → lessons with material text', () => {
    const html = courseContentToHtml({
      name: '3D Airmanship',
      modules: [
        {
          name: 'Fundamentals',
          lessons: [
            {
              name: 'Pitch',
              text: 'Pitch is nose up/down.',
              proTips: 'Trim early.',
            },
          ],
        },
      ],
    });
    expect(html).toContain('3D Airmanship');
    expect(html).toContain('Fundamentals');
    expect(html).toContain('Pitch');
    expect(html).toContain('Pitch is nose up/down.');
    expect(html).toContain('Trim early.');
  });

  it('omits missing material without crashing', () => {
    const html = courseContentToHtml({
      name: 'C',
      modules: [
        { name: 'M', lessons: [{ name: 'L', text: null, proTips: null }] },
      ],
    });
    expect(html).toContain('L');
  });
});
