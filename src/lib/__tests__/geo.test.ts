import type { Position } from '@/types/domain';
import { findRegion, haversineKm, verifyCheckin, type RegionFeature } from '@/lib/geo';

/** Two adjacent 10x10 squares (lng,lat). A = [0..10], B = [10..20]. */
function square(id: string, x0: number, x1: number): RegionFeature {
  return {
    type: 'Feature',
    properties: { id, country: 'JP', name: id, nameLocal: id },
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

describe('findRegion', () => {
  it('returns the region containing the point', () => {
    expect(findRegion([5, 5], REGIONS)).toBe('JP-A');
    expect(findRegion([15, 5], REGIONS)).toBe('JP-B');
  });

  it('returns null when the point is outside every region (sea / border gap)', () => {
    expect(findRegion([50, 50], REGIONS)).toBeNull();
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
  it('ok inside a city polygon — the polygon IS the collected city', () => {
    const r = verifyCheckin({ regions: REGIONS, pos: [2, 2], accuracyM: 20 });
    expect(r).toMatchObject({ ok: true, reason: 'ok', regionId: 'JP-A' });
  });

  it('no-region when outside all polygons — never snaps to a nearby city', () => {
    const r = verifyCheckin({ regions: REGIONS, pos: [99, 99], accuracyM: 10 });
    expect(r).toMatchObject({ ok: false, reason: 'no-region', regionId: null });
  });

  it('low-accuracy when the fix is too coarse', () => {
    const r = verifyCheckin({ regions: REGIONS, pos: [5, 5], accuracyM: 9999 });
    expect(r).toMatchObject({ ok: false, reason: 'low-accuracy' });
  });

  it('no-fix when there is no position', () => {
    const r = verifyCheckin({ regions: REGIONS, pos: null, accuracyM: null });
    expect(r).toMatchObject({ ok: false, reason: 'no-fix' });
  });

  it('accepts an unknown accuracy (null) as long as the point is in a region', () => {
    const r = verifyCheckin({ regions: REGIONS, pos: [15, 5], accuracyM: null });
    expect(r).toMatchObject({ ok: true, regionId: 'JP-B' });
  });
});
