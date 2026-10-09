// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { DisciplineLevelsBoard } from '../discipline-levels-board';

const lesson = (id: number, name: string): LibraryLesson => ({
  id,
  name,
  slug: `l-${id}`,
  isConfigured: true,
  isAvailable: true,
  courseCount: 0,
  courseIds: [],
  videoProvider: null,
  disciplineModuleId: null,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
});

describe('DisciplineLevelsBoard', () => {
  it('lays out one column per module, each lesson a button named by the lesson', () => {
    render(
      <DisciplineLevelsBoard
        mode="basic"
        columns={[
          { key: 1, name: 'Basics', lessons: [lesson(10, 'Stalls')] },
          {
            key: 2,
            name: 'Advanced',
            lessons: [lesson(20, 'Spins'), lesson(21, 'Upsets')],
          },
        ]}
        posters={{ '10': 'https://p/10.jpg' }}
      />,
    );

    const advanced = screen.getByRole('region', { name: 'Advanced' });
    expect(
      within(advanced)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Spins', 'Upsets']);
    // The poster is decorative: the name alone names the button.
    expect(screen.getByRole('button', { name: 'Stalls' })).toBeTruthy();
  });

  it('hands the pressed lesson to onSelectLesson', () => {
    const onSelectLesson = vi.fn();
    render(
      <DisciplineLevelsBoard
        mode="basic"
        columns={[{ key: 1, name: 'Basics', lessons: [lesson(10, 'Stalls')] }]}
        onSelectLesson={onSelectLesson}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stalls' }));
    expect(onSelectLesson).toHaveBeenCalledWith(10);
  });

  it('says so when the discipline has nothing to show', () => {
    render(<DisciplineLevelsBoard mode="basic" columns={[]} />);
    expect(
      screen.getByText('This discipline has no lessons yet.'),
    ).toBeTruthy();
  });

  it('shows a loading tile, not the no-video glyph, while posters are on their way', () => {
    const { container } = render(
      <DisciplineLevelsBoard
        mode="basic"
        columns={[
          {
            key: 1,
            name: 'Basics',
            lessons: [
              lesson(10, 'Stalls'),
              { ...lesson(11, 'Briefing'), isConfigured: false },
            ],
          },
        ]}
        postersLoading
      />,
    );
    const tiles = container.querySelectorAll('button > span:first-child');
    // The lesson with a video waits; the one without says so straight away.
    expect(tiles[0].getAttribute('data-loading')).toBe('true');
    expect(tiles[0].querySelector('svg')).toBeNull();
    expect(tiles[1].getAttribute('data-loading')).toBeNull();
    expect(tiles[1].querySelector('svg')).not.toBeNull();
  });

  it('marks the lessons carrying the current mode as pressed, and badges every level', () => {
    render(
      <DisciplineLevelsBoard
        mode="intermediate"
        columns={[
          {
            key: 1,
            name: 'Basics',
            lessons: [
              { ...lesson(10, 'Stalls'), levels: ['advanced', 'basic'] },
              { ...lesson(11, 'Spins'), levels: ['intermediate'] },
            ],
          },
        ]}
      />,
    );
    const stalls = screen.getByRole('button', { name: /Stalls/ });
    const spins = screen.getByRole('button', { name: /Spins/ });
    expect(stalls.getAttribute('aria-pressed')).toBe('false');
    expect(spins.getAttribute('aria-pressed')).toBe('true');
    // Every level the lesson has, in the canonical order.
    expect(
      within(stalls)
        .getAllByText(/^(Basic|Intermediate|Advanced)$/)
        .map((b) => b.textContent),
    ).toEqual(['Basic', 'Advanced']);
  });
});
