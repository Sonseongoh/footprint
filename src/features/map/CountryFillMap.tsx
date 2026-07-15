/**
 * Country fill map. Projects city-area outlines (manual equirectangular fit
 * — d3-geo's fitSize miscomputes under Hermes) into react-native-svg <Polygon>s.
 *
 * Collection model: the fill units ARE the cities (KR 시, JP 시구정촌, TH 암프).
 * A visited city fills gold; admin-1 backdrop polygons underneath keep the
 * countryside between collectable cities reading as land, not holes.
 *
 * Labels never overlap (greedy collision cull) and reveal progressively as you
 * zoom (visited first). Pinch zoom / drag pan.
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
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';

import { Palette } from '@/constants/footprint-theme';
import { regionNameKo } from '@/data/names-ko';
import type { RegionFeature } from '@/lib/geo';
import type { Visit } from '@/types/domain';

const AnimatedG = Animated.createAnimatedComponent(G);

const VIEW_W = 320;
const VIEW_H = 460;
const PAD = 0.94;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** initial zoom when a country opens — just enough that the region-name tier
 *  (경기·홋카이도…) is already readable instead of a bare silhouette */
const START_SCALE = 1.7;
const REGION_FONT = 8;
const UNIT_FONT = 6;
// Labels are counter-scaled by scale^LABEL_EXP (not full scale), so on-screen
// text grows ~scale^(1-LABEL_EXP) as you zoom in — readable at deep zoom while
// still shrinking RELATIVE to the map so more small cities reveal. cull() uses
// the same exponent so its overlap boxes match the rendered size.
const LABEL_EXP = 0.6;

export interface CountryFillMapProps {
  /** fill/collection units — the city areas */
  regions: RegionFeature[];
  /** visited units keyed by regionId (= city area id) */
  visits: Record<string, Visit>;
  /** backdrop polygons drawn under the fill units (admin-1, for rural coverage) */
  background?: RegionFeature[];
  /** tap a fill unit → open its city detail (notes). Omitted on share pages. */
  onSelectRegion?: (regionId: string) => void;
}

interface Poly {
  key: string;
  points: string;
  fill: string;
  /** the fill unit's region id (fill polys only; backdrop polys omit it) */
  regionId?: string;
}
interface UnitLabel {
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
    const z = Math.pow(zoom, LABEL_EXP);
    const w = Math.max(l.text.length * fontSize * 0.58, fontSize) / z;
    const h = fontSize / z;
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
  visits,
  background = [],
  onSelectRegion,
}: CountryFillMapProps) {
  // settled zoom (updated on gesture end) — re-culls labels so more reveal as you
  // zoom in. Kept as state (not the animated value) so the cull memo can read it.
  const [zoomLevel, setZoomLevel] = useState(START_SCALE);

  const { polys, bgPolys, rawLabels, rawRegionLabels } = useMemo(() => {
    const empty = {
      polys: [] as Poly[],
      bgPolys: [] as Poly[],
      rawLabels: [] as UnitLabel[],
      rawRegionLabels: [] as UnitLabel[],
    };
    if (regions.length === 0) return empty;

    // a backdrop region reads as visited when any of its cities is
    const visitedParents = new Set<string>();
    for (const f of regions) {
      const parent = (f.properties as { regionId?: string }).regionId;
      if (parent && visits[f.properties.id]) visitedParents.add(parent);
    }

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
    const rawRegionLabels: UnitLabel[] = [];
    for (const f of background) {
      let largest: [number, number][] = [];
      outerRings(f).forEach((ring, i) => {
        const pts: string[] = [];
        const proj: [number, number][] = [];
        for (const [lng, lat] of ring) {
          const xy = project(lng, lat);
          proj.push(xy);
          pts.push(`${xy[0].toFixed(1)},${xy[1].toFixed(1)}`);
        }
        // darker than the fill units so unvisited cities read as distinct tiles
        if (pts.length > 2) {
          bgPolys.push({ key: `bg-${f.properties.id}-${i}`, points: pts.join(' '), fill: Palette.bgElevated });
          if (proj.length > largest.length) largest = proj;
        }
      });
      // mid-zoom orientation tier: 도/현/주 names over the backdrop
      if (largest.length) {
        let cx = 0, cy = 0, lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
        for (const [x, y] of largest) {
          cx += x; cy += y;
          if (x < lx) lx = x;
          if (x > hx) hx = x;
          if (y < ly) ly = y;
          if (y > hy) hy = y;
        }
        const visited = visitedParents.has(f.properties.id);
        rawRegionLabels.push({
          key: f.properties.id,
          x: cx / largest.length,
          y: cy / largest.length,
          text: regionNameKo(f.properties.id, f.properties.name),
          visited,
          weight: (visited ? 1e9 : 0) + (hx - lx) * (hy - ly),
        });
      }
    }

    const polys: Poly[] = [];
    const rawLabels: UnitLabel[] = [];
    for (const f of regions) {
      const visited = Boolean(visits[f.properties.id]);
      const fill = visited ? Palette.gold : Palette.slate;
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
          polys.push({ key: `${f.properties.id}-${i}`, points: pts.join(' '), fill, regionId: f.properties.id });
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
        rawLabels.push({
          key: f.properties.id,
          x: cx / largest.length,
          y: cy / largest.length,
          text: regionNameKo(f.properties.id, f.properties.name),
          visited,
          weight: (visited ? 1e9 : 0) + area,
        });
      }
    }

    return { polys, bgPolys, rawLabels, rawRegionLabels };
  }, [regions, visits, background]);

  // re-cull on settled zoom only (cheap) — projection above doesn't re-run
  const labels = useMemo(() => cull(rawLabels, UNIT_FONT, zoomLevel), [rawLabels, zoomLevel]);
  const regionLabels = useMemo(
    () => cull(rawRegionLabels, REGION_FONT, zoomLevel),
    [rawRegionLabels, zoomLevel],
  );

  const W = Dimensions.get('window').width - 48;
  const H = W * (VIEW_H / VIEW_W);
  // Render the SVG at the settled zoom's resolution (capped) so it's crisp, not a
  // stretched bitmap. The view transform then only scales the live pinch delta.
  const renderScale = Math.min(Math.max(zoomLevel, 1), 3);

  // ── gestures ─────────────────────────────────────────────────────────────
  const scale = useSharedValue(START_SCALE);
  const savedScale = useSharedValue(START_SCALE);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Switching country swaps the polygons but this component stays mounted —
  // without a reset the new country inherits the old one's zoom/pan (panned
  // off-screen, or past the label tiers) and looks broken/label-less.
  useEffect(() => {
    scale.value = START_SCALE;
    savedScale.value = START_SCALE;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
    setZoomLevel(START_SCALE);
  }, [regions, scale, savedScale, tx, ty, savedTx, savedTy]);

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

  // fontSize is counter-scaled by the LIVE scale (not the settled zoom) so it
  // updates *continuously* as you pinch — otherwise it only re-applies on gesture
  // end and the text visibly snaps the instant you lift your fingers. The ^EXP
  // (LABEL_EXP < 1) lets on-screen text grow gently with zoom so it's readable at
  // max zoom. Set on the group; SVG font-size inherits to the child <SvgText>.
  // Two label tiers CROSSFADE with overlap — the city tier is fully in before
  // the region tier is fully out, so no zoom level ever shows zero labels.
  const regionLabelProps = useAnimatedProps(() => ({
    fontSize: REGION_FONT / Math.pow(scale.value, LABEL_EXP),
    opacity: interpolate(scale.value, [1.25, 1.7, 2.4, 2.8], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const labelProps = useAnimatedProps(() => ({
    fontSize: UNIT_FONT / Math.pow(scale.value, LABEL_EXP),
    opacity: interpolate(scale.value, [2.2, 2.6], [0, 1], Extrapolation.CLAMP),
  }));

  const inner = (
    <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, animStyle]}>
      <Svg width={W * renderScale} height={H * renderScale} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          {/* admin-1 backdrop for full land coverage under the city units */}
          {bgPolys.map((p) => (
            <Polygon key={p.key} points={p.points} fill={p.fill} stroke={Palette.bg} strokeWidth={0.6} />
          ))}

        {polys.map((p) => (
          <Polygon
            key={p.key}
            points={p.points}
            fill={p.fill}
            stroke={Palette.surfaceLine}
            strokeWidth={0.4}
            onPress={onSelectRegion && p.regionId ? () => onSelectRegion(p.regionId!) : undefined}
          />
        ))}

          <AnimatedG animatedProps={regionLabelProps}>
            {regionLabels.map((l) => (
              <SvgText
                key={`r-${l.key}`}
                x={l.x}
                y={l.y}
                fontWeight={l.visited ? '700' : '400'}
                fill={l.visited ? Palette.ink : Palette.muted}
                textAnchor="middle"
                alignmentBaseline="middle">
                {l.text}
              </SvgText>
            ))}
          </AnimatedG>

          <AnimatedG animatedProps={labelProps}>
            {labels.map((l) => (
              <SvgText
                key={l.key}
                x={l.x}
                y={l.y}
                fontWeight={l.visited ? '700' : '400'}
                fill={l.visited ? Palette.bg : Palette.muted}
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
