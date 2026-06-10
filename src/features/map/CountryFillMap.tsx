/**
 * Country fill map (admin-1 choropleth). Projects each region's outline into the
 * viewBox with a simple equirectangular fit (computed manually — d3-geo's
 * fitSize miscomputes scale under Hermes) and draws each ring as a
 * react-native-svg <Polygon>. Visited regions are gold, unvisited slate.
 *
 * Labels never overlap: a greedy collision cull drops lower-priority labels that
 * would collide (visited regions win), and the two label levels (province ↔ city)
 * crossfade with a gap so they never show at once. Province names show first;
 * city names take over when you zoom deep.
 *
 * Pinch to zoom, drag to pan, double-tap to reset (gesture-handler + reanimated).
 * This is the collection payoff screen — confirmed in /plan-design-review.
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
import Svg, { Circle, G, Polygon, Text as SvgText } from 'react-native-svg';

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

export interface CountryFillMapProps {
  regions: RegionFeature[];
  cities: CityPoint[];
  /** visited regions keyed by regionId */
  visits: Record<string, Visit>;
}

interface Poly {
  key: string;
  points: string;
  visited: boolean;
}
interface Label {
  key: string;
  x: number;
  y: number;
  text: string;
  visited: boolean;
  weight: number; // higher = placed first
}

function outerRings(f: RegionFeature): Position[][] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates[0]]
    : f.geometry.coordinates.map((poly) => poly[0]);
}

/** Greedy collision cull: place high-priority labels first, drop any that would
 *  overlap an already-placed one. Non-overlapping in viewBox → at every zoom. */
function cull(labels: Label[], fontSize: number): Label[] {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: Label[] = [];
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

export function CountryFillMap({ regions, cities, visits }: CountryFillMapProps) {
  const { polys, provinces, cityLabels } = useMemo(() => {
    const empty = { polys: [] as Poly[], provinces: [] as Label[], cityLabels: [] as Label[] };
    if (regions.length === 0) return empty;

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
    const rawProvinces: Label[] = [];
    for (const f of regions) {
      const visited = Boolean(visits[f.properties.id]);
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
          polys.push({ key: `${f.properties.id}-${i}`, points: pts.join(' '), visited });
          if (proj.length > largest.length) largest = proj;
        }
      });
      if (largest.length) {
        let cx = 0, cy = 0;
        let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
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
          // visited regions always win; otherwise bigger regions first
          weight: (visited ? 1e9 : 0) + area,
        });
      }
    }

    const rawCities: Label[] = cities.map((c, i) => {
      const [x, y] = project(c.position[0], c.position[1]);
      // input is population-sorted, so earlier = more important
      return { key: c.id, x, y, text: cityNameKo(c.country, c.name), visited: false, weight: -i };
    });

    return {
      polys,
      provinces: cull(rawProvinces, PROVINCE_FONT),
      cityLabels: cull(rawCities, CITY_FONT),
    };
  }, [regions, cities, visits]);

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

  // sequential crossfade with a gap: provinces fully gone before cities appear.
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
            <Polygon
              key={p.key}
              points={p.points}
              fill={p.visited ? Palette.gold : Palette.slate}
              stroke={Palette.bg}
              strokeWidth={0.5}
            />
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
            {cityLabels.map((l) => (
              <G key={l.key}>
                <Circle cx={l.x} cy={l.y} r={1.2} fill={Palette.gold} />
                <SvgText
                  x={l.x}
                  y={l.y - 3}
                  fontSize={CITY_FONT}
                  fill={Palette.ink}
                  textAnchor="middle"
                  alignmentBaseline="baseline">
                  {l.text}
                </SvgText>
              </G>
            ))}
          </AnimatedG>
        </Svg>
      </Animated.View>
    </GestureDetector>
  );
}
