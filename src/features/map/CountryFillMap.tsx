/**
 * Country fill map (admin-1 choropleth). Projects each region's outline into the
 * viewBox with a simple equirectangular fit (computed manually — d3-geo's
 * fitSize miscomputes scale under Hermes) and draws each ring as a
 * react-native-svg <Polygon>. Visited regions are gold, unvisited slate.
 *
 * Pinch to zoom, drag to pan, double-tap to reset (gesture-handler + reanimated).
 * This is the collection payoff screen — confirmed in /plan-design-review.
 */
import type { Position } from 'geojson';
import { useMemo } from 'react';
import { Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Palette } from '@/constants/footprint-theme';
import type { RegionFeature } from '@/lib/geo';
import type { Visit } from '@/types/domain';

const VIEW_W = 320;
const VIEW_H = 460;
const PAD = 0.94;
const MIN_SCALE = 1;
const MAX_SCALE = 8;

export interface CountryFillMapProps {
  regions: RegionFeature[];
  /** visited regions keyed by regionId */
  visits: Record<string, Visit>;
}

interface Poly {
  key: string;
  points: string;
  visited: boolean;
}

/** Outer rings of a Polygon/MultiPolygon feature (holes skipped). */
function outerRings(f: RegionFeature): Position[][] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates[0]]
    : f.geometry.coordinates.map((poly) => poly[0]);
}

export function CountryFillMap({ regions, visits }: CountryFillMapProps) {
  const polys = useMemo<Poly[]>(() => {
    if (regions.length === 0) return [];

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
    const scale = Math.min(VIEW_W / spanLng, VIEW_H / spanLat) * PAD;
    const offX = (VIEW_W - spanLng * scale) / 2;
    const offY = (VIEW_H - spanLat * scale) / 2;
    const project = (lng: number, lat: number): [number, number] => [
      (lng - minLng) * scale + offX,
      (maxLat - lat) * scale + offY,
    ];

    const out: Poly[] = [];
    for (const f of regions) {
      const visited = Boolean(visits[f.properties.id]);
      outerRings(f).forEach((ring, i) => {
        const pts: string[] = [];
        for (const [lng, lat] of ring) {
          const [x, y] = project(lng, lat);
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        if (pts.length > 2) {
          out.push({ key: `${f.properties.id}-${i}`, points: pts.join(' '), visited });
        }
      });
    }
    return out;
  }, [regions, visits]);

  const W = Dimensions.get('window').width - 48;
  const H = W * (VIEW_H / VIEW_W);

  // ── gestures: pinch-zoom + pan, double-tap to reset ──────────────────────
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
    .maxPointers(1) // single-finger pan; two fingers = pinch
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
        </Svg>
      </Animated.View>
    </GestureDetector>
  );
}
