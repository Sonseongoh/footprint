/**
 * Country fill map. Projects admin-1 region outlines (manual equirectangular fit
 * — d3-geo's fitSize miscomputes under Hermes) into react-native-svg <Polygon>s.
 *
 * Collection model (도시 단위 깊이):
 *  - a region's gold fill is DEPTH-PROPORTIONAL: the more of its cities you've
 *    visited, the more saturated the gold (1/10 cities = faint, 10/10 = full).
 *  - city dots: visited cities are bright gold, unvisited faint — so empty
 *    cities stay visible and pull you back ("여수는 갔는데 순천은 안 갔네").
 *
 * Labels never overlap (greedy collision cull). Province ↔ city labels crossfade
 * with a gap as you zoom. Pinch zoom / drag pan / double-tap reset.
 */
import type { Position } from 'geojson';
import { useMemo } from 'react';
import { Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';

import { Palette } from '@/constants/footprint-theme';
import { cityNameKo, regionNameKo } from '@/data/names-ko';
import type { RegionFeature } from '@/lib/geo';
import type { CityPoint, Visit } from '@/types/domain';

const AnimatedG = Animated.createAnimatedComponent(G);

const VIEW_W = 320;
const VIEW_H = 460;
const PAD = 0.94;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const PROVINCE_FONT = 8;
const CITY_FONT = 6;
const MIN_FILL = 0.32; // any visit shows at least this much gold

export interface CountryFillMapProps {
  regions: RegionFeature[];
  cities: CityPoint[];
  /** visited regions keyed by regionId (region-level, for fallback tint) */
  visits: Record<string, Visit>;
  /** ids of cities that have been checked into */
  visitedCityIds: Set<string>;
}

interface Poly {
  key: string;
  points: string;
  fill: string;
}
interface ProvinceLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  visited: boolean;
  weight: number;
}
interface CityLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  visited: boolean;
  weight: number;
}

function outerRings(f: RegionFeature): Position[][] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates[0]]
    : f.geometry.coordinates.map((poly) => poly[0]);
}

/** linear blend between two #rrggbb colors */
function mix(a: string, b: string, t: number): string {
  const ai = parseInt(a.slice(1), 16);
  const bi = parseInt(b.slice(1), 16);
  const r = Math.round(((ai >> 16) & 255) + (((bi >> 16) & 255) - ((ai >> 16) & 255)) * t);
  const g = Math.round(((ai >> 8) & 255) + (((bi >> 8) & 255) - ((ai >> 8) & 255)) * t);
  const bl = Math.round((ai & 255) + ((bi & 255) - (ai & 255)) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function cull<T extends { x: number; y: number; text: string; weight: number }>(
  labels: T[],
  fontSize: number,
): T[] {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: T[] = [];
  for (const l of [...labels].sort((a, b) => b.weight - a.weight)) {
    const w = Math.max(l.text.length * fontSize * 0.58, fontSize);
    const h = fontSize;
    const box = { x0: l.x - w / 2 - 1, y0: l.y - h / 2 - 1, x1: l.x + w / 2 + 1, y1: l.y + h / 2 + 1 };
    const hit = placed.some(
      (p) => !(box.x1 < p.x0 || box.x0 > p.x1 || box.y1 < p.y0 || box.y0 > p.y1),
    );
    if (!hit) {
      placed.push(box);
      out.push(l);
    }
  }
  return out;
}

export function CountryFillMap({ regions, cities, visits, visitedCityIds }: CountryFillMapProps) {
  const { polys, provinces, cityLabels } = useMemo(() => {
    const empty = {
      polys: [] as Poly[],
      provinces: [] as ProvinceLabel[],
      cityLabels: [] as CityLabel[],
    };
    if (regions.length === 0) return empty;

    // per-region city totals + visited counts → depth ratio
    const total: Record<string, number> = {};
    const visitedCount: Record<string, number> = {};
    for (const c of cities) {
      total[c.regionId] = (total[c.regionId] ?? 0) + 1;
      if (visitedCityIds.has(c.id)) {
        visitedCount[c.regionId] = (visitedCount[c.regionId] ?? 0) + 1;
      }
    }
    const fillFor = (regionId: string): string => {
      const visited = Boolean(visits[regionId]) || (visitedCount[regionId] ?? 0) > 0;
      if (!visited) return Palette.slate;
      const ratio = total[regionId] ? (visitedCount[regionId] ?? 0) / total[regionId] : 0;
      return mix(Palette.slate, Palette.gold, Math.max(MIN_FILL, Math.min(1, ratio)));
    };

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const f of regions) {
      for (const ring of outerRings(f)) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    const spanLng = maxLng - minLng || 1;
    const spanLat = maxLat - minLat || 1;
    const s = Math.min(VIEW_W / spanLng, VIEW_H / spanLat) * PAD;
    const offX = (VIEW_W - spanLng * s) / 2;
    const offY = (VIEW_H - spanLat * s) / 2;
    const project = (lng: number, lat: number): [number, number] => [
      (lng - minLng) * s + offX,
      (maxLat - lat) * s + offY,
    ];

    const polys: Poly[] = [];
    const rawProvinces: ProvinceLabel[] = [];
    for (const f of regions) {
      const fill = fillFor(f.properties.id);
      const visited = fill !== Palette.slate;
      let largest: [number, number][] = [];
      outerRings(f).forEach((ring, i) => {
        const pts: string[] = [];
        const proj: [number, number][] = [];
        for (const [lng, lat] of ring) {
          const xy = project(lng, lat);
          proj.push(xy);
          pts.push(`${xy[0].toFixed(1)},${xy[1].toFixed(1)}`);
        }
        if (pts.length > 2) {
          polys.push({ key: `${f.properties.id}-${i}`, points: pts.join(' '), fill });
          if (proj.length > largest.length) largest = proj;
        }
      });
      if (largest.length) {
        let cx = 0, cy = 0, lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
        for (const [x, y] of largest) {
          cx += x; cy += y;
          if (x < lx) lx = x;
          if (x > hx) hx = x;
          if (y < ly) ly = y;
          if (y > hy) hy = y;
        }
        const area = (hx - lx) * (hy - ly);
        rawProvinces.push({
          key: f.properties.id,
          x: cx / largest.length,
          y: cy / largest.length,
          text: regionNameKo(f.properties.id, f.properties.name),
          visited,
          weight: (visited ? 1e9 : 0) + area,
        });
      }
    }

    const rawCities: CityLabel[] = cities.map((c, i) => {
      const [x, y] = project(c.position[0], c.position[1]);
      const visited = visitedCityIds.has(c.id);
      return {
        key: c.id,
        x,
        y,
        text: cityNameKo(c.country, c.name),
        visited,
        weight: (visited ? 1e9 : 0) - i,
      };
    });

    return {
      polys,
      provinces: cull(rawProvinces, PROVINCE_FONT),
      cityLabels: cull(rawCities, CITY_FONT),
    };
  }, [regions, cities, visits, visitedCityIds]);

  const W = Dimensions.get('window').width - 48;
  const H = W * (VIEW_H / VIEW_W);

  // ── gestures ─────────────────────────────────────────────────────────────
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(2)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      scale.value = withTiming(1);
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      savedScale.value = 1;
      savedTx.value = 0;
      savedTy.value = 0;
    });
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const provinceProps = useAnimatedProps(() => ({
    opacity: interpolate(scale.value, [1.25, 1.7, 3.0, 3.4], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const cityProps = useAnimatedProps(() => ({
    opacity: interpolate(scale.value, [3.5, 3.9], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, animStyle]}>
        <Svg width={W} height={H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {polys.map((p) => (
            <Polygon key={p.key} points={p.points} fill={p.fill} stroke={Palette.bg} strokeWidth={0.5} />
          ))}

          <AnimatedG animatedProps={provinceProps}>
            {provinces.map((l) => (
              <SvgText
                key={l.key}
                x={l.x}
                y={l.y}
                fontSize={PROVINCE_FONT}
                fontWeight={l.visited ? '700' : '400'}
                fill={l.visited ? Palette.bg : Palette.muted}
                textAnchor="middle"
                alignmentBaseline="middle">
                {l.text}
              </SvgText>
            ))}
          </AnimatedG>

          <AnimatedG animatedProps={cityProps}>
            {/* state is carried by label color/weight (no markers):
                visited = bright white bold, unvisited = dim grey */}
            {cityLabels.map((l) => (
              <SvgText
                key={l.key}
                x={l.x}
                y={l.y}
                fontSize={CITY_FONT}
                fontWeight={l.visited ? '700' : '400'}
                fill={l.visited ? Palette.ink : Palette.muted}
                fillOpacity={l.visited ? 1 : 0.5}
                textAnchor="middle"
                alignmentBaseline="middle">
                {l.text}
              </SvgText>
            ))}
          </AnimatedG>
        </Svg>
      </Animated.View>
    </GestureDetector>
  );
}
