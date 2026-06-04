/**
 * Country fill map (admin-1 choropleth). Renders region polygons via a d3-geo
 * projection into react-native-svg paths; visited regions are gold, unvisited
 * slate. Boundary lines are the dark background colour between regions.
 *
 * This is the collection payoff screen — confirmed in /plan-design-review.
 */
import { geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { Palette } from '@/constants/footprint-theme';
import type { RegionFeature } from '@/lib/geo';
import type { Visit } from '@/types/domain';

const VIEW_W = 320;
const VIEW_H = 460;

export interface CountryFillMapProps {
  regions: RegionFeature[];
  /** visited regions keyed by regionId */
  visits: Record<string, Visit>;
}

export function CountryFillMap({ regions, visits }: CountryFillMapProps) {
  const shapes = useMemo(() => {
    if (regions.length === 0) return [];
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: regions as unknown as FeatureCollection['features'],
    };
    const projection = geoMercator().fitSize([VIEW_W, VIEW_H], collection);
    const toPath = geoPath(projection);
    return regions.map((r) => ({
      id: r.properties.id,
      d: toPath(r as unknown as GeoPermissibleObjects) ?? '',
      visited: Boolean(visits[r.properties.id]),
    }));
  }, [regions, visits]);

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      {shapes.map((s) => (
        <Path
          key={s.id}
          d={s.d}
          fill={s.visited ? Palette.gold : Palette.slate}
          stroke={Palette.bg}
          strokeWidth={0.8}
        />
      ))}
    </Svg>
  );
}
