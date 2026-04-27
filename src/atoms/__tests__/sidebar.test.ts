// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { useAtom } from 'jotai';
import { describe, expect, it } from 'vitest';
import { openModuleSlugAtom } from '../sidebar';

describe('openModuleSlugAtom', () => {
  it('defaults to null', () => {
    const { result } = renderHook(() => useAtom(openModuleSlugAtom));
    expect(result.current[0]).toBeNull();
  });

  it('stores the provided slug', () => {
    const { result } = renderHook(() => useAtom(openModuleSlugAtom));
    act(() => result.current[1]('getting-started'));
    expect(result.current[0]).toBe('getting-started');
  });

  it('accepts null to close', () => {
    const { result } = renderHook(() => useAtom(openModuleSlugAtom));
    act(() => result.current[1]('getting-started'));
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
  });
});
