// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ captions: vi.fn(), request: vi.fn() }));
vi.mock('#/data-hooks/use-lesson-captions', () => ({
  useLessonCaptions: h.captions,
}));
vi.mock('#/data-hooks/use-request-lesson-captions', () => ({
  useRequestLessonCaptions: h.request,
}));
const status = vi.hoisted(() =>
  vi.fn((_p: Record<string, unknown>) => <div />),
);
const loadError = vi.hoisted(() => vi.fn(() => <p>load error</p>));
vi.mock('../captions-status', () => ({
  CaptionsStatus: status,
  CaptionsStatusLoadError: loadError,
}));

import { CaptionsStatusContainer } from '../captions-status-container';

afterEach(() => vi.clearAllMocks());

const arrange = (variablesLang: 'en' | 'fr') => {
  h.captions.mockReturnValue({
    data: { status: 'none', error: null, lang: 'fr' },
  });
  h.request.mockReturnValue({
    mutate: vi.fn(),
    isPending: true,
    isError: true,
    error: new Error('boom'),
    variables: { lessonId: 10, courseId: 7, lang: variablesLang },
  });
};

describe('CaptionsStatusContainer', () => {
  it('hands the line the request state of its own language', () => {
    arrange('fr');
    render(<CaptionsStatusContainer lessonId={10} courseId={7} lang="fr" />);
    const props = status.mock.calls.at(-1)?.[0];
    expect(props?.isRequesting).toBe(true);
    expect(props?.requestError).toBe('boom');
  });

  it('does not show another language’s request state', () => {
    arrange('en');
    render(<CaptionsStatusContainer lessonId={10} courseId={7} lang="fr" />);
    const props = status.mock.calls.at(-1)?.[0];
    expect(props?.isRequesting).toBe(false);
    expect(props?.requestError).toBeNull();
  });

  // A failed status read used to render nothing: an admin couldn't tell
  // "no line" from "couldn't ask".
  it('says so when the captions status could not be loaded', () => {
    h.captions.mockReturnValue({ data: undefined, isError: true });
    h.request.mockReturnValue({ mutate: vi.fn(), isPending: false });
    render(<CaptionsStatusContainer lessonId={10} courseId={7} lang="fr" />);
    expect(loadError).toHaveBeenCalled();
    expect(screen.queryByText('load error')).not.toBeNull();
    expect(status).not.toHaveBeenCalled();
  });
});
