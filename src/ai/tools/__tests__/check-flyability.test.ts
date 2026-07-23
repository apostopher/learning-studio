import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  extractIcaoFromText,
  resolveLocation,
} from '#/ai/tools/check-flyability';

describe('extractIcaoFromText', () => {
  it('pulls a 4-letter ICAO from text', () => {
    expect(extractIcaoFromText('can I fly at KJFK today?')).toBe('KJFK');
  });

  it('returns null when none present', () => {
    expect(extractIcaoFromText('is it windy?')).toBeNull();
  });

  it('does not match lowercase 4-letter words', () => {
    expect(extractIcaoFromText('this is just a word')).toBeNull();
  });

  it('matches the first uppercase 4-letter code when several words are present', () => {
    expect(extractIcaoFromText('flying from KATL to KJFK tomorrow')).toBe(
      'KATL',
    );
  });
});

describe('resolveLocation', () => {
  it('returns the icao when provided directly, ignoring missing coords', () => {
    expect(resolveLocation({ icao: 'KJFK', uiMessages: [] })).toEqual({
      icao: 'KJFK',
      lat: undefined,
      lng: undefined,
    });
  });

  it('returns numeric lat/lng when both are provided', () => {
    expect(
      resolveLocation({ lat: '40.6413', lng: '-73.7781', uiMessages: [] }),
    ).toEqual({
      icao: undefined,
      lat: 40.6413,
      lng: -73.7781,
    });
  });

  it('falls back to geolocation metadata on the last UI message when no icao/coords given', () => {
    const uiMessages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [],
        metadata: {
          latitude: 33.9425,
          longitude: -118.408,
          timestamp: '2026-07-21T00:00:00.000Z',
        },
      },
    ];
    expect(resolveLocation({ uiMessages })).toEqual({
      icao: undefined,
      lat: 33.9425,
      lng: -118.408,
    });
  });

  it('ignores geolocation metadata that fails schema validation', () => {
    const uiMessages: UIMessage[] = [
      { id: '1', role: 'user', parts: [], metadata: { foo: 'bar' } },
    ];
    expect(resolveLocation({ uiMessages })).toEqual({ needsLocation: true });
  });

  it('returns needsLocation when no icao, coords, or geolocation metadata are available', () => {
    expect(resolveLocation({ uiMessages: [] })).toEqual({
      needsLocation: true,
    });
  });

  it('prefers explicit lat/lng over stale geolocation metadata', () => {
    const uiMessages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [],
        metadata: {
          latitude: 0,
          longitude: 0,
          timestamp: '2026-07-21T00:00:00.000Z',
        },
      },
    ];
    expect(
      resolveLocation({ lat: '40.6413', lng: '-73.7781', uiMessages }),
    ).toEqual({
      icao: undefined,
      lat: 40.6413,
      lng: -73.7781,
    });
  });
});
