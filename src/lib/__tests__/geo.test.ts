import type { CityPoint, Position } from '@/types/domain';
import {
  findRegion,
  haversineKm,
  nearestCity,
  verifyCheckin,
  type RegionFeature,
} from '@/lib/geo';

/** Two adjacent 10x10 squares (lng,lat). A = [0..10], B = [10..20]. */
function square(id: string, x0: number, x1: number): RegionFeature {
  return {
    type: 'Feature',
    properties: { id, country: 'JP' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x0, 0],
          [x1, 0],
          [x1, 10],
          [x0, 10],
          [x0, 0],
        ],
      ],
    },
  };
}

const REGIONS: RegionFeature[] = [square('JP-A', 0, 10), square('JP-B', 10, 20)];

const CITIES: CityPoint[] = [
  { id: 'a1', regionId: 'JP-A', country: 'JP', name: 'A1', nameLocal: 'A1', position: [2, 2] },
  { id: 'a2', regionId: 'JP-A', country: 'JP', name: 'A2', nameLocal: 'A2', position: [8, 8] },
  { id: 'b1', regionId: 'JP-B', country: 'JP', name: 'B1', nameLocal: 'B1', position: [15, 5] },
];

describe('findRegion', () => {
  it('returns the region containing the point', () => {
    expect(findRegion([5, 5], REGIONS)).toBe('JP-A');
    expect(findRegion([15, 5], REGIONS)).toBe('JP-B');
  });

  it('returns null when the point is outside every region (sea / border gap)', () => {
    expect(findRegion([50, 50], REGIONS)).toBeNull();
  });
});

describe('nearestCity', () => {
  it('picks the closest city, constrained to a region', () => {
    expect(nearestCity([2.5, 2.5], CITIES, 'JP-A')?.id).toBe('a1');
    expect(nearestCity([7.5, 7.5], CITIES, 'JP-A')?.id).toBe('a2');
  });

  it('ignores cities outside the given region', () => {
    // closest absolute point is b1, but constrained to JP-A it must not be picked
    expect(nearestCity([9.9, 5], CITIES, 'JP-A')?.regionId).toBe('JP-A');
  });
});

describe('haversineKm', () => {
  it('is ~0 for identical points and positive otherwise', () => {
    const p: Position = [126.97, 37.56];
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
    expect(haversineKm([0, 0], [0, 1])).toBeGreaterThan(100); // ~111km per degree lat
  });
});

describe('verifyCheckin', () => {
  const base = { regions: REGIONS, cities: CITIES };

  it('ok inside a region, resolving region + nearest city', () => {
    const r = verifyCheckin({ ...base, pos: [2, 2], accuracyM: 20 });
    expect(r).toMatchObject({ ok: true, reason: 'ok', regionId: 'JP-A' });
    expect(r.city?.id).toBe('a1');
  });

  it('no-region when outside all polygons', () => {
    const r = verifyCheckin({ ...base, pos: [99, 99], accuracyM: 10 });
    expect(r).toMatchObject({ ok: false, reason: 'no-region', regionId: null, city: null });
  });

  it('low-accuracy when the fix is too coarse', () => {
    const r = verifyCheckin({ ...base, pos: [5, 5], accuracyM: 9999 });
    expect(r).toMatchObject({ ok: false, reason: 'low-accuracy' });
  });

  it('no-fix when there is no position', () => {
    const r = verifyCheckin({ ...base, pos: null, accuracyM: null });
    expect(r).toMatchObject({ ok: false, reason: 'no-fix' });
  });

  it('accepts an unknown accuracy (null) as long as the point is in a region', () => {
    const r = verifyCheckin({ ...base, pos: [15, 5], accuracyM: null });
    expect(r).toMatchObject({ ok: true, regionId: 'JP-B' });
  });
});
