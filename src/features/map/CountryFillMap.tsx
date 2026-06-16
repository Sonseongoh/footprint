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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, G, Polygon, Text as SvgText } from 'react-native-svg';

import { Palette } from '@/constants/footprint-theme';
import { cityDisplayKo, regionNameKo } from '@/data/names-ko';
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
const FILL_FLOOR = 0.45; // gold intensity for 1 visited city (→ 1.0 when all done)

/** linear blend between two #rrggbb colors */
function mix(a: string, b: string, t: number): string {
  const ai = parseInt(a.slice(1), 16);
  const bi = parseInt(b.slice(1), 16);
  const r = Math.round(((ai >> 16) & 255) + (((bi >> 16) & 255) - ((ai >> 16) & 255)) * t);
  const g = Math.round(((ai >> 8) & 255) + (((bi >> 8) & 255) - ((ai >> 8) & 255)) * t);
  const bl = Math.round((ai & 255) + ((bi & 255) - (ai & 255)) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

export interface CountryFillMapProps {
  regions: RegionFeature[];
  cities: CityPoint[];
  /** visited regions keyed by regionId (region-level, for fallback tint) */
  visits: Record<string, Visit>;
  /** ids of cities that have been checked into */
  visitedCityIds: Set<string>;
  /** backdrop polygons drawn under the fill units (KR: 도, for 군 coverage) */
  background?: RegionFeature[];
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

function cull<T extends { x: number; y: number; text: string; weight: number }>(
  labels: T[],
  fontSize: number,
  zoom: number,
): T[] {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: T[] = [];
  // labels stay constant on-screen size (font is counter-scaled), so their
  // footprint in map space shrinks as you zoom in → more labels fit → small
  // cities (안양·군포…) reveal progressively.
  for (const l of [...labels].sort((a, b) => b.weight - a.weight)) {
    const w = Math.max(l.text.length * fontSize * 0.58, fontSize) / zoom;
    const h = fontSize / zoom;
    const box = { x0: l.x - w / 2 - 0.5, y0: l.y - h / 2 - 0.5, x1: l.x + w / 2 + 0.5, y1: l.y + h / 2 + 0.5 };
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

export function CountryFillMap({
  regions,
  cities,
  visits,
  visitedCityIds,
  background = [],
}: CountryFillMapProps) {
  // settled zoom (updated on gesture end) — re-culls labels so more reveal as you
  // zoom in. Kept as state (not the animated value) so the cull memo can read it.
  const [zoomLevel, setZoomLevel] = useState(1);

  const { polys, bgPolys, rawProvinces, rawCities } = useMemo(() => {
    const empty = {
      polys: [] as Poly[],
      bgPolys: [] as Poly[],
      rawProvinces: [] as ProvinceLabel[],
      rawCities: [] as CityLabel[],
    };
    if (regions.length === 0) return empty;

    // per-region city totals + visited counts → depth-proportional fill
    const total: Record<string, number> = {};
    const visitedCount: Record<string, number> = {};
    for (const c of cities) {
      total[c.regionId] = (total[c.regionId] ?? 0) + 1;
      if (visitedCityIds.has(c.id)) {
        visitedCount[c.regionId] = (visitedCount[c.regionId] ?? 0) + 1;
      }
    }
    // depth-proportional: a region's gold deepens with the share of its cities
    // visited. A clear floor so one visit already reads as "been here", reaching
    // full gold only when the whole region is collected.
    const fillFor = (regionId: string): string => {
      const visited = Boolean(visits[regionId]) || (visitedCount[regionId] ?? 0) > 0;
      if (!visited) return Palette.slate;
      const ratio = total[regionId] ? (visitedCount[regionId] ?? 0) / total[regionId] : 1;
      return mix(Palette.slate, Palette.gold, Math.min(1, FILL_FLOOR + (1 - FILL_FLOOR) * ratio));
    };

    // bounds span both the fill units and the backdrop so they align
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const f of [...background, ...regions]) {
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
    const bgPolys: Poly[] = [];
    for (const f of background) {
      outerRings(f).forEach((ring, i) => {
        const pts: string[] = [];
        for (const [lng, lat] of ring) {
          const [x, y] = project(lng, lat);
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        // darker than the fill units so unvisited 시 read as distinct tiles
        if (pts.length > 2) bgPolys.push({ key: `bg-${f.properties.id}-${i}`, points: pts.join(' '), fill: Palette.bgElevated });
      });
    }

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
        text: cityDisplayKo(c),
        visited,
        weight: (visited ? 1e9 : 0) - i,
      };
    });

    return { polys, bgPolys, rawProvinces, rawCities };
  }, [regions, cities, visits, visitedCityIds, background]);

  // re-cull on settled zoom only (cheap) — projection above doesn't re-run
  const provinces = useMemo(
    () => cull(rawProvinces, PROVINCE_FONT, zoomLevel),
    [rawProvinces, zoomLevel],
  );
  const cityLabels = useMemo(() => cull(rawCities, CITY_FONT, zoomLevel), [rawCities, zoomLevel]);

  const W = Dimensions.get('window').width - 48;
  const H = W * (VIEW_H / VIEW_W);
  // Render the SVG at the settled zoom's resolution (capped) so it's crisp, not a
  // stretched bitmap. The view transform then only scales the live pinch delta.
  const renderScale = Math.min(Math.max(zoomLevel, 1), 3);

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
      scheduleOnRN(setZoomLevel, scale.value);
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
  const gesture = Gesture.Simultaneous(pinch, pan);

  // the SVG is pre-rendered at renderScale; the transform applies only the
  // remaining ratio so on-screen size stays scale.value (crisp at settled zoom)
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value / renderScale },
    ],
  }));

  // ── web: gesture-handler doesn't take mouse/wheel, so drive the same shared
  //    values directly from DOM wheel-zoom + drag-pan (used by the share page) ──
  const isWeb = Platform.OS === 'web';
  const webRef = useRef<View | null>(null);
  useEffect(() => {
    if (!isWeb) return;
    const el = webRef.current as unknown as HTMLElement | null;
    if (!el) return;
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = scale.value * Math.exp(-e.deltaY * 0.0015);
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      savedScale.value = scale.value;
      setZoomLevel(scale.value);
    };
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: MouseEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      tx.value += e.clientX - lastX;
      ty.value += e.clientY - lastY;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
      el.style.cursor = 'grab';
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isWeb, scale, savedScale, tx, ty, savedTx, savedTy]);

  // when there's no separate city layer (KR: the 시 ARE the units), region labels
  // must stay visible when zoomed in — don't fade them out into nothing.
  const hasCityLayer = cityLabels.length > 0;
  // fontSize is counter-scaled (÷ zoom) so labels keep a constant on-screen size
  // while the map scales — that's what lets more labels reveal as you zoom in.
  const provinceProps = useAnimatedProps(() => ({
    opacity: hasCityLayer
      ? interpolate(scale.value, [1.25, 1.7, 3.0, 3.4], [0, 1, 1, 0], Extrapolation.CLAMP)
      : interpolate(scale.value, [1.25, 1.7], [0, 1], Extrapolation.CLAMP),
  }));
  const cityProps = useAnimatedProps(() => ({
    opacity: interpolate(scale.value, [3.5, 3.9], [0, 1], Extrapolation.CLAMP),
  }));
  // label fonts counter-scaled to the settled zoom → constant on-screen size
  const provinceFont = PROVINCE_FONT / zoomLevel;
  const cityFont = CITY_FONT / zoomLevel;

  const inner = (
    <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, animStyle]}>
      <Svg width={W * renderScale} height={H * renderScale} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {/* backdrop (KR: 도) for full coverage under the fill units */}
          {bgPolys.map((p) => (
            <Polygon key={p.key} points={p.points} fill={p.fill} stroke={Palette.bg} strokeWidth={0.6} />
          ))}

        {polys.map((p) => (
          <Polygon key={p.key} points={p.points} fill={p.fill} stroke={Palette.surfaceLine} strokeWidth={0.4} />
        ))}

          {/* visited city pins — always visible so you can see WHICH city you've
              collected even when the region is only partly filled */}
          {cityLabels
            .filter((l) => l.visited)
            .map((l) => (
              <Circle key={`pin-${l.key}`} cx={l.x} cy={l.y} r={1.5} fill={Palette.gold} stroke={Palette.bg} strokeWidth={0.4} />
            ))}

          <AnimatedG animatedProps={provinceProps}>
            {provinces.map((l) => (
              <SvgText
                key={l.key}
                x={l.x}
                y={l.y}
                fontSize={provinceFont}
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
                fontSize={cityFont}
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
  );

  if (isWeb) {
    // ref'd container receives the DOM wheel/drag listeners
    return (
      <View ref={webRef} style={{ flex: 1, overflow: 'hidden' }}>
        {inner}
      </View>
    );
  }
  return <GestureDetector gesture={gesture}>{inner}</GestureDetector>;
}
