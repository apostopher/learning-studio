import { describe, expect, it } from 'vitest';
import type {
  MetarTafNearest,
  TAFApiSuccessResponse,
} from '#/server/flyability-types';
import { flyDataToHtml } from '#/server/flyability';

const metarFixture: MetarTafNearest = {
  icao: 'KJFK',
  stationName: 'John F Kennedy Intl',
  observedISO: '2026-01-15T12:00:00.000Z',
  visibility_m: 9999,
  ceiling_ft_agl: 2500,
  wind_speed_ms: 12,
  wind_gust_ms: 18,
  raw_text: 'KJFK 151200Z 28012G18KT 10SM FEW025 SCT250 08/M02 A3012',
  weatherImage: 'few',
};

const tafFixture: TAFApiSuccessResponse = {
  status: true,
  credits: 1,
  airport: {
    id: 'KJFK',
    iata: 'JFK',
    name: 'John F Kennedy Intl',
    name_translated: 'John F Kennedy Intl',
    city_name: 'New York',
    admin1: 'NY',
    admin2: '',
    country_id: 'US',
    country_name: 'United States',
    lat: 40.6413,
    lng: -73.7781,
    metar: true,
    taf: true,
    timezone: -5,
    fir: 'KZNY',
    elevation: 13,
    type: 1,
    last_notam: 0,
  },
  stations: [{ id: 'KJFK', name: 'John F Kennedy Intl', taf: true }],
  taf: {
    endtime: 1768564800,
    starttime: 1768521600,
    observed: 1768521600,
    raw: 'TAF KJFK 151200Z 1512/1618 28012G18KT P6SM FEW025',
    station_id: 'KJFK',
    hours: [
      {
        code: 'VFR',
        code_color: '#28a745',
        date: 'thursday',
        is_day: true,
        report: 'Few clouds',
        start: 1768521600,
        wind_dir: 280,
        wind_speed: 12,
        wind_gust: 18,
        visibility: 10,
      },
    ],
  },
};

describe('flyDataToHtml', () => {
  it('renders METAR station, category (VFR), and wind into HTML', () => {
    const html = flyDataToHtml({ metar: metarFixture, taf: null });

    expect(html).toContain('<');
    expect(html).toContain('KJFK');
    expect(html).toContain('John F Kennedy Intl');
    expect(html).toContain('12 knots');
    expect(html).toContain('18 knots');
    expect(html).toContain('9999 meters');
    expect(html).toContain('2500 feet AGL');
    expect(html).toContain(metarFixture.raw_text);
  });

  it('renders "No METAR data available" when metar is null', () => {
    const html = flyDataToHtml({ metar: null, taf: null });

    expect(html).toContain('No METAR data available');
  });

  it('renders TAF forecast hours (code/category, wind, visibility) into HTML', () => {
    const html = flyDataToHtml({ metar: null, taf: tafFixture });

    expect(html).toContain('Weather Forecast (TAF)');
    expect(html).toContain('VFR');
    expect(html).toContain('Few clouds');
    expect(html).toContain('280°');
    expect(html).toContain(tafFixture.taf.raw);
  });

  it('renders "No TAF data available" when taf is null', () => {
    const html = flyDataToHtml({ metar: null, taf: null });

    expect(html).toContain('No TAF data available');
  });
});
