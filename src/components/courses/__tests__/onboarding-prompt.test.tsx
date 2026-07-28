// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingPrompt } from '../onboarding-prompt';

describe('OnboardingPrompt', () => {
  it('renders the offer copy', () => {
    render(<OnboardingPrompt onStart={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/personalize this course/i)).not.toBeNull();
  });

  it('fires onStart when Start is clicked', async () => {
    const onStart = vi.fn();
    render(<OnboardingPrompt onStart={onStart} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when Not now is clicked', async () => {
    const onDismiss = vi.fn();
    render(<OnboardingPrompt onStart={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /^not now$/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
