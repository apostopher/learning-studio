// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => route.search,
    useNavigate: () => route.navigate,
  }),
}));
vi.mock('../documents-section-container', () => ({
  DocumentsSectionContainer: () => <p>Documents content</p>,
}));
vi.mock('../../persona/persona-section-container', () => ({
  PersonaSectionContainer: () => <p>Persona content</p>,
}));
vi.mock('../preview-chat-container', () => ({
  PreviewChatContainer: () => <p>Chat content</p>,
}));
vi.mock('../sessions-section-container', () => ({
  SessionsSectionContainer: () => <p>Sessions content</p>,
}));

import { AiTrainingPageContainer } from '../ai-training-page-container';

beforeEach(() => {
  route.search = {};
  route.navigate.mockClear();
});

describe('AiTrainingPageContainer', () => {
  it('offers every section but Chat, which is hidden for now', () => {
    render(<AiTrainingPageContainer />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Documents',
      'Persona',
      'Sessions',
    ]);
  });

  it('opens Documents for a link to Chat', () => {
    route.search = { trainingSection: 'chat' };
    render(<AiTrainingPageContainer />);
    expect(screen.getByText('Documents content')).toBeTruthy();
    expect(screen.queryByText('Chat content')).toBeNull();
    expect(
      screen.getByRole('tab', { name: 'Documents', selected: true }),
    ).toBeTruthy();
  });

  it('still opens the others by link and by tab', () => {
    route.search = { trainingSection: 'sessions' };
    render(<AiTrainingPageContainer />);
    expect(screen.getByText('Sessions content')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Persona' }));
    expect(route.navigate.mock.calls[0][0].search({ section: 'x' })).toEqual({
      section: 'x',
      trainingSection: 'persona',
    });
  });
});
