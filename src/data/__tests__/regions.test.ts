import { availableCountries, loadCities, loadRegions, resolveCheckin } from '@/data';
import { verifyCheckin } from '@/lib/geo';
import type { Position } from '@/types/domain';

describe('bundled data', () => {
  it('loads admin-1 units for JP (47), KR (17), TH (77)', () => {
    expect(loadRegions('JP')).toHaveLength(47);
    expect(loadRegions('KR')).toHaveLength(17);
    expect(loadRegions('TH')).toHaveLength(77);
  });

  it('lists all three v1 countries as available', () => {
    expect(availableCountries()).toEqual(['KR', 'JP', 'TH']);
  });

  it('resolves real Japanese coordinates to prefecture + nearest city', () => {
    const regions = loadRegions('JP');
    const cities = loadCities('JP');

    const tokyo: Position = [139.6917, 35.6895];
    const rTokyo = verifyCheckin({ pos: tokyo, accuracyM: 20, regions, cities });
    expect(rTokyo).toMatchObject({ ok: true, regionId: 'JP-13' });
    expect(rTokyo.city?.id).toBe('jp-tokyo');
  });

  it('returns no-region for a point in the open sea', () => {
    const regions = loadRegions('JP');
    const cities = loadCities('JP');
    const pacific: Position = [145, 30];
    expect(verifyCheckin({ pos: pacific, accuracyM: 20, regions, cities })).toMatchObject({
      ok: false,
      reason: 'no-region',
    });
  });
});

describe('resolveCheckin (multi-country)', () => {
  it('detects the country, region and city from a GPS point', () => {
    const seoul = resolveCheckin([126.978, 37.5665], 20);
    expect(seoul).toMatchObject({ ok: true, country: 'KR', regionId: 'KR-11' });
    expect(seoul.city?.id).toBe('kr-seoul');

    const tokyo = resolveCheckin([139.6917, 35.6895], 20);
    expect(tokyo).toMatchObject({ ok: true, country: 'JP', regionId: 'JP-13' });
    expect(tokyo.city?.id).toBe('jp-tokyo');

    const bangkok = resolveCheckin([100.5018, 13.7563], 20);
    expect(bangkok).toMatchObject({ ok: true, country: 'TH', regionId: 'TH-10' });
    expect(bangkok.city?.id).toBe('th-bangkok');
  });

  it('returns no-region (country null) outside all bundled countries', () => {
    expect(resolveCheckin([145, 30], 20)).toMatchObject({
      ok: false,
      reason: 'no-region',
      country: null,
    });
  });

  it('surfaces low-accuracy and no-fix', () => {
    expect(resolveCheckin([126.978, 37.5665], 9999)).toMatchObject({ reason: 'low-accuracy' });
    expect(resolveCheckin(null, null)).toMatchObject({ reason: 'no-fix', country: null });
  });
});
