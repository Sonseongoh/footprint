/**
 * Entry globe — a d3-geo orthographic projection of the world rendered with
 * react-native-svg. Inactive countries are subtle slate; the active collection
 * countries (KR/JP/TH) glow gold.
 *
 * Interactions: drag to spin the globe; tap an active (gold) country to open
 * its fill map. Tap resolution = invert the projection at the tap point, then
 * point-in-polygon against the active countries' world outlines.
 *
 * Rendering note: react-native-svg under Hermes mis-renders d3 geoPath `d`
 * strings (same issue as the country fill map), so each ring is drawn as a
 * <Polygon points=...>. Back-hemisphere clipping is done manually by dropping
 * ring vertices more than ~90° from the view centre (slightly rough at the
 * horizon — fine for a stylized globe).
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { geoOrthographic } from 'd3-geo';
import type { Feature, Geometry, MultiPolygon, Polygon as GeoPolygon, Position } from 'geojson';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Palette } from '@/constants/footprint-theme';
import { countryNameKo } from '@/data/names-ko';
import { COUNTRIES, type CountryCode } from '@/types/domain';

type CountryFeature = Feature<Geometry, { iso: string; nameKo: string }>;
const world = require('@/data/world.json') as { features: CountryFeature[] };

const VIEW = 320;
const R = 150;
const ACTIVE = new Set<string>(['KR', 'JP', 'TH'] satisfies CountryCode[]);
/** initial view centre, roughly between Korea/Japan/Thailand */
const INITIAL_CENTER: [number, number] = [115, 22];
/** degrees of rotation per pixel of drag */
const DRAG_SENS = 0.35;

const DEG = Math.PI / 180;

/** great-circle angular distance (degrees) between two [lng,lat] points */
function angle(a: [number, number], b: [number, number]): number {
  const [l1, p1] = [a[0] * DEG, a[1] * DEG];
  const [l2, p2] = [b[0] * DEG, b[1] * DEG];
  const s = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return Math.acos(Math.min(1, Math.max(-1, s))) / DEG;
}

function ringsOf(geom: Geometry): Position[][] {
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
  return [];
}

interface Shape {
  key: string;
  points: string;
  active: boolean;
  visited: boolean;
}
interface GlobeLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  active: boolean;
  visited: boolean;
  weight: number;
}

const LABEL_FONT = 7;
/** zoom level from which country names appear */
const LABEL_ZOOM = 1.6;

/** stable chip anchors for the collectable countries (ring centroids wobble) */
const CHIP_ANCHORS: Record<CountryCode, [number, number]> = {
  KR: [127.8, 36.3],
  JP: [138.7, 36.8],
  TH: [101.0, 15.5],
};
const CHIP_FLAGS: Record<CountryCode, string> = { KR: '🇰🇷', JP: '🇯🇵', TH: '🇹🇭' };
const CHIP_FONT = 7.5;
const CHIP_H = 14;
/** per-country pill offset [dx, lift] — KR/JP sit close, so fan them apart */
const CHIP_OFFSETS: Record<CountryCode, [number, number]> = {
  KR: [-22, 30],
  JP: [16, 14],
  TH: [0, 21],
};

interface Chip {
  cc: CountryCode;
  x: number;
  y: number;
  w: number;
  dx: number;
  lift: number;
  visited: boolean;
}

/** greedy collision cull (same approach as the country fill map) */
function cullLabels(labels: GlobeLabel[]): GlobeLabel[] {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out: GlobeLabel[] = [];
  for (const l of [...labels].sort((a, b) => b.weight - a.weight)) {
    const w = Math.max(l.text.length * LABEL_FONT * 0.62, LABEL_FONT);
    const h = LABEL_FONT;
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

export interface CountryGlobeProps {
  /** called when the user taps an active country */
  onSelectCountry?: (country: CountryCode) => void;
  /** countries the user has checked into — drawn solid gold ("collected").
   *  Active-but-unvisited countries are drawn as a gold outline ("to collect"). */
  visitedCountries?: Set<CountryCode>;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const EMPTY_VISITED = new Set<CountryCode>();

export function CountryGlobe({ onSelectCountry, visitedCountries = EMPTY_VISITED }: CountryGlobeProps) {
  // view centre in [lng, lat]; drag moves it. zoom scales the projection.
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);
  const [dragStart, setDragStart] = useState<[number, number]>(INITIAL_CENTER);
  const [zoom, setZoom] = useState(1);
  const [pinchStart, setPinchStart] = useState(1);

  const projection = useMemo(
    () =>
      geoOrthographic()
        .scale(R * zoom)
        .translate([VIEW / 2, VIEW / 2])
        .rotate([-center[0], -center[1]]),
    [center, zoom],
  );

  const { shapes, labels } = useMemo(() => {
    const shapes: Shape[] = [];
    const rawLabels: GlobeLabel[] = [];
    world.features.forEach((f, fi) => {
      const active = ACTIVE.has(f.properties.iso);
      const visited = active && visitedCountries.has(f.properties.iso as CountryCode);
      let best: { sx: number; sy: number; n: number; area: number } | null = null;
      ringsOf(f.geometry).forEach((ring, ri) => {
        const pts: string[] = [];
        let sx = 0, sy = 0;
        let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
        for (const coord of ring) {
          const lnglat = coord as [number, number];
          if (angle(lnglat, center) > 89) continue; // manual back-hemisphere clip
          const xy = projection(lnglat);
          if (xy) {
            pts.push(`${xy[0].toFixed(1)},${xy[1].toFixed(1)}`);
            sx += xy[0]; sy += xy[1];
            if (xy[0] < lx) lx = xy[0];
            if (xy[0] > hx) hx = xy[0];
            if (xy[1] < ly) ly = xy[1];
            if (xy[1] > hy) hy = xy[1];
          }
        }
        if (pts.length > 2) {
          // fi in the key: several territories share an empty iso code
          shapes.push({ key: `${fi}-${ri}`, points: pts.join(' '), active, visited });
          const area = (hx - lx) * (hy - ly);
          if (!best || area > best.area) best = { sx, sy, n: pts.length, area };
        }
      });
      // active countries carry a permanent chip instead of a zoom-gated label
      if (best && f.properties.nameKo && !active) {
        const b = best as { sx: number; sy: number; n: number; area: number };
        rawLabels.push({
          key: `l${fi}`,
          x: b.sx / b.n,
          y: b.sy / b.n,
          // everyday short names (중국, 북한…), not formal official ones
          text: countryNameKo(f.properties.iso, f.properties.nameKo),
          active,
          visited,
          weight: b.area,
        });
      }
    });
    return { shapes, labels: cullLabels(rawLabels) };
  }, [projection, center, visitedCountries]);

  // "지원 나라" chips — always visible so the tappable countries are obvious
  // at a glance (faint outlines alone were easy to miss). Front hemisphere only.
  const chips = useMemo(() => {
    const out: Chip[] = [];
    for (const cc of ['KR', 'JP', 'TH'] as CountryCode[]) {
      const anchor = CHIP_ANCHORS[cc];
      if (angle(anchor, center) > 80) continue; // behind / hugging the limb
      const xy = projection(anchor);
      if (!xy) continue;
      const name = COUNTRIES[cc].nameLocal;
      // flag glyph ≈ 9 + gap 3 + hangul ≈ 7.6/char + padding
      const w = 9 + 3 + name.length * 7.6 + 12;
      const [dx, lift] = CHIP_OFFSETS[cc];
      out.push({ cc, x: xy[0], y: xy[1], w, dx, lift, visited: visitedCountries.has(cc) });
    }
    return out;
  }, [projection, center, visitedCountries]);

  const size = Dimensions.get('window').width - 48;
  const toView = size / VIEW;

  // ── drag to rotate (slower when zoomed in), with release inertia ─────────
  const spinTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopSpin() {
    if (spinTimer.current) {
      clearInterval(spinTimer.current);
      spinTimer.current = null;
    }
  }
  useEffect(() => stopSpin, []);

  function applyDrag(dx: number, dy: number) {
    const sens = DRAG_SENS / zoom;
    const lng = dragStart[0] - dx * sens;
    const lat = Math.min(75, Math.max(-75, dragStart[1] + dy * sens));
    setCenter([lng, lat]);
  }

  /** decaying spin after release; velocity in px/s from the pan gesture */
  function startSpin(vx: number, vy: number) {
    stopSpin();
    const sens = DRAG_SENS / zoom;
    // px/s → deg per 16ms frame
    let vLng = (-vx * sens) / 62.5;
    let vLat = (vy * sens) / 62.5;
    if (Math.abs(vLng) < 0.05 && Math.abs(vLat) < 0.05) {
      commitDrag();
      return;
    }
    spinTimer.current = setInterval(() => {
      vLng *= 0.94;
      vLat *= 0.94;
      if (Math.abs(vLng) < 0.02 && Math.abs(vLat) < 0.02) {
        stopSpin();
        commitDrag();
        return;
      }
      setCenter(([lng, lat]) => [lng + vLng, Math.min(75, Math.max(-75, lat + vLat))]);
    }, 16);
  }

  function commitDrag() {
    setCenter((c) => {
      setDragStart(c);
      return c;
    });
  }

  /** grabbing the globe mid-spin: stop and re-anchor the drag at the current view */
  function beginDrag() {
    stopSpin();
    commitDrag();
  }

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(2)
    .onBegin(() => {
      runOnJS(beginDrag)();
    })
    .onUpdate((e) => {
      runOnJS(applyDrag)(e.translationX, e.translationY);
    })
    .onEnd((e) => {
      runOnJS(startSpin)(e.velocityX, e.velocityY);
    });

  // ── pinch to zoom ─────────────────────────────────────────────────────────
  function applyPinch(s: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStart * s)));
  }
  function commitPinch() {
    setZoom((z) => {
      setPinchStart(z);
      return z;
    });
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      runOnJS(applyPinch)(e.scale);
    })
    .onEnd(() => {
      runOnJS(commitPinch)();
    });

  // ── tap an active country (or its chip) ──────────────────────────────────
  function handleTap(x: number, y: number) {
    if (!onSelectCountry) return;
    // chips first — they float above the anchor, often over sea, where the
    // projection-inversion country test below would miss
    const vx = x / toView;
    const vy = y / toView;
    for (const c of chips) {
      const cx = c.x + c.dx;
      const y1 = c.y - c.lift + CHIP_H + 2; // +2: forgiving touch slop
      if (vx > cx - c.w / 2 - 2 && vx < cx + c.w / 2 + 2 && vy > c.y - c.lift - 2 && vy < y1) {
        onSelectCountry(c.cc);
        return;
      }
    }
    const inverted = projection.invert?.([x / toView, y / toView]);
    if (!inverted) return;
    // ignore taps outside the globe disk
    if (angle(inverted as [number, number], center) > 90) return;
    for (const f of world.features) {
      if (!ACTIVE.has(f.properties.iso)) continue;
      if (
        booleanPointInPolygon(
          inverted as [number, number],
          f as Feature<GeoPolygon | MultiPolygon>,
        )
      ) {
        onSelectCountry(f.properties.iso as CountryCode);
        return;
      }
    }
  }

  const tap = Gesture.Tap()
    .maxDuration(220)
    .onEnd((e) => {
      runOnJS(handleTap)(e.x, e.y);
    });

  const gesture = Gesture.Exclusive(Gesture.Simultaneous(pinch, pan), tap);

  return (
    <GestureDetector gesture={gesture}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        {/* sea: teal highlight (upper-left) fading into deep navy at the limb —
            gives the globe its sphere feel (approved design direction) */}
        <Defs>
          <RadialGradient id="sea" cx="38%" cy="32%" r="75%">
            <Stop offset="0%" stopColor={Palette.ocean1} />
            <Stop offset="55%" stopColor="#163A55" />
            <Stop offset="100%" stopColor={Palette.ocean2} />
          </RadialGradient>
        </Defs>
        {/* ocean disk (scales with zoom) */}
        <Circle cx={VIEW / 2} cy={VIEW / 2} r={R * zoom} fill="url(#sea)" />
        {shapes.map((s) => {
          const slot = s.active && !s.visited; // a country you can collect but haven't
          return (
            <Polygon
              key={s.key}
              points={s.points}
              // visited = solid gold (collected); slot = slate with a FAINT gold
              // outline (present but not "lit"); everything else = plain slate.
              fill={s.visited ? Palette.gold : Palette.surface}
              stroke={slot ? Palette.gold : Palette.bg}
              strokeOpacity={slot ? 0.35 : 1}
              strokeWidth={slot ? 0.5 : 0.3}
            />
          );
        })}
        {/* country names from LABEL_ZOOM (active countries first, collision-culled) */}
        {zoom >= LABEL_ZOOM &&
          labels.map((l) => (
            <SvgText
              key={l.key}
              x={l.x}
              y={l.y}
              fontSize={LABEL_FONT}
              fontWeight={l.visited ? '700' : '400'}
              // dark text only on the filled gold; everything else stays muted so
              // nothing "glows" until it's actually collected
              fill={l.visited ? Palette.bg : Palette.muted}
              textAnchor="middle"
              alignmentBaseline="middle">
              {l.text}
            </SvgText>
          ))}
        {/* collectable-country chips — the "start here" affordance */}
        {chips.map((c) => (
          <G key={`chip-${c.cc}`}>
            {/* leader dot pinning the pill to its country */}
            <Circle cx={c.x} cy={c.y - 3.5} r={1.6} fill={Palette.gold} />
            <Rect
              x={c.x + c.dx - c.w / 2}
              y={c.y - c.lift}
              width={c.w}
              height={CHIP_H}
              rx={CHIP_H / 2}
              fill={c.visited ? Palette.gold : Palette.bgElevated}
              stroke={Palette.gold}
              strokeOpacity={c.visited ? 1 : 0.55}
              strokeWidth={0.6}
            />
            <SvgText
              x={c.x + c.dx}
              y={c.y - c.lift + CHIP_H / 2 + 0.5}
              fontSize={CHIP_FONT}
              fontWeight="700"
              fill={c.visited ? Palette.bg : Palette.ink}
              textAnchor="middle"
              alignmentBaseline="middle">
              {`${CHIP_FLAGS[c.cc]} ${COUNTRIES[c.cc].nameLocal}`}
            </SvgText>
          </G>
        ))}

        {/* rim */}
        <Circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={R * zoom}
          fill="none"
          stroke={Palette.surfaceLine}
          strokeWidth={1}
        />
      </Svg>
    </GestureDetector>
  );
}
