/**
 * Country fill map (admin-1 choropleth). Projects each region's outline into the
 * viewBox with a simple equirectangular fit (computed manually — d3-geo's
 * fitSize miscomputes scale under Hermes) and draws each ring as a
 * react-native-svg <Polygon>. Visited regions are gold, unvisited slate.
 *
 * Level-of-detail labels (like a real map): province names show at a slight
 * zoom and fade out as you zoom deeper, where city names + dots fade in.
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
}

function outerRings(f: RegionFeature): Position[][] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates[0]]
    : f.geometry.coordinates.map((poly) => poly[0]);
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
    const provinces: Label[] = [];
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
        for (const [x, y] of largest) { cx += x; cy += y; }
        provinces.push({
          key: f.properties.id,
          x: cx / largest.length,
          y: cy / largest.length,
          text: regionNameKo(f.properties.id, f.properties.name),
          visited,
        });
      }
    }

    const cityLabels: Label[] = cities.map((c) => {
      const [x, y] = project(c.position[0], c.position[1]);
      return { key: c.id, x, y, text: cityNameKo(c.country, c.name), visited: false };
    });

    return { polys, provinces, cityLabels };
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

  // LOD crossfade: provinces show at slight zoom and fade out deep; cities fade
  // in deep, replacing them.
  const provinceProps = useAnimatedProps(() => ({
    opacity: interpolate(scale.value, [1.2, 1.6, 3.0, 4.0], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const cityProps = useAnimatedProps(() => ({
    opacity: interpolate(scale.value, [3.0, 4.0], [0, 1], Extrapolation.CLAMP),
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

          {/* province names: visible at slight zoom, fade out as you go deeper */}
          <AnimatedG animatedProps={provinceProps}>
            {provinces.map((l) => (
              <SvgText
                key={l.key}
                x={l.x}
                y={l.y}
                fontSize={8}
                fontWeight={l.visited ? '700' : '400'}
                fill={l.visited ? Palette.bg : Palette.muted}
                textAnchor="middle"
                alignmentBaseline="middle">
                {l.text}
              </SvgText>
            ))}
          </AnimatedG>

          {/* city dots + names: fade in when zoomed deep */}
          <AnimatedG animatedProps={cityProps}>
            {cityLabels.map((l) => (
              <G key={l.key}>
                <Circle cx={l.x} cy={l.y} r={1.2} fill={Palette.gold} />
                <SvgText
                  x={l.x}
                  y={l.y - 3}
                  fontSize={5}
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
