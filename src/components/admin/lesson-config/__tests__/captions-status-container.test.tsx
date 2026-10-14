// @vitest-environment jsdom
import { render } from '@testing-library/react';
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
vi.mock('../captions-status', () => ({ CaptionsStatus: status }));

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
});
