import { availableCountries, loadCities, loadRegions, resolveCheckin } from '@/data';
import { verifyCheckin } from '@/lib/geo';
import type { Position } from '@/types/domain';

describe('bundled data', () => {
  it('loads 47 Japanese prefectures and 17 Korean provinces', () => {
    expect(loadRegions('JP')).toHaveLength(47);
    expect(loadRegions('KR')).toHaveLength(17);
  });

  it('lists KR + JP as available, TH not yet', () => {
    expect(availableCountries()).toEqual(['KR', 'JP']);
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
