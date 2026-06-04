import { availableCountries, loadCities, loadRegions } from '@/data';
import { verifyCheckin } from '@/lib/geo';
import type { Position } from '@/types/domain';

describe('bundled Japan data', () => {
  it('loads 47 prefectures', () => {
    expect(loadRegions('JP')).toHaveLength(47);
  });

  it('lists JP as available, KR/TH not yet', () => {
    expect(availableCountries()).toEqual(['JP']);
  });

  it('resolves real city coordinates to the right prefecture + nearest city', () => {
    const regions = loadRegions('JP');
    const cities = loadCities('JP');

    const tokyo: Position = [139.6917, 35.6895];
    const rTokyo = verifyCheckin({ pos: tokyo, accuracyM: 20, regions, cities });
    expect(rTokyo).toMatchObject({ ok: true, regionId: 'JP-13' });
    expect(rTokyo.city?.id).toBe('jp-tokyo');

    const osaka: Position = [135.5023, 34.6937];
    const rOsaka = verifyCheckin({ pos: osaka, accuracyM: 20, regions, cities });
    expect(rOsaka).toMatchObject({ ok: true, regionId: 'JP-27' });
    expect(rOsaka.city?.id).toBe('jp-osaka');
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
