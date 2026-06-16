/**
 * Regenerate src/data/cities.{kr,jp,th}.json from GeoNames.
 *
 * Usage:
 *   1. Download + unzip GeoNames cities15000:
 *        curl -fsSL https://download.geonames.org/export/dump/cities15000.zip -o cities15000.zip
 *        unzip cities15000.zip
 *   2. node scripts/build-cities.js path/to/cities15000.txt
 *
 * City coords come from GeoNames (CC BY 4.0 — attribution required). regionId is
 * computed by point-in-polygon against our own src/data/regions.*.json so the ids
 * stay consistent regardless of GeoNames' admin1 numbering. Coastal/island cities
 * that fall outside the simplified polygons snap to the nearest region.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'src', 'data');
const TOP_N = 80; // top cities per country by population
// Population-representative: include plain populated places (PPL) so big non-seat
// cities (성남·부천·Pattaya…) are kept, not just admin seats. PPLX sections are
// already excluded by GeoNames' cities15000 (>15k pop) feature set.
const KEEP_FCODE = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPL']);
// Single-city metropolises: keep ONLY the metropolis itself, drop its internal
// districts (서울 구 / 도쿄 특별구 / 방콕 khet) so one check-in there = one city.
const MONOCITY_REGIONS = new Set([
  'KR-11', 'KR-21', 'KR-22', 'KR-23', 'KR-24', 'KR-25', 'KR-26', 'KR-29', 'JP-13', 'TH-10',
]);
const COUNTRIES = ['KR', 'JP', 'TH'];

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-cities.js path/to/cities15000.txt');
  process.exit(1);
}

function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeom(pt, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (pointInRing(pt, poly[0])) {
      let inHole = false;
      for (let k = 1; k < poly.length; k++) if (pointInRing(pt, poly[k])) { inHole = true; break; }
      if (!inHole) return true;
    }
  }
  return false;
}
function centroid(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let sx = 0, sy = 0, n = 0;
  for (const poly of polys) for (const [x, y] of poly[0]) { sx += x; sy += y; n++; }
  return [sx / n, sy / n];
}
function km(a, b) {
  const R = 6371, d = Math.PI / 180;
  const dla = (b[1] - a[1]) * d, dlo = (b[0] - a[0]) * d;
  const x = Math.sin(dla / 2) ** 2 + Math.cos(a[1] * d) * Math.cos(b[1] * d) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function resolveRegion(pt, regions) {
  for (const f of regions) if (pointInGeom(pt, f.geometry)) return f.properties.id;
  let best = null, bestD = Infinity;
  for (const f of regions) {
    const c = centroid(f.geometry);
    const d = (c[0] - pt[0]) ** 2 + (c[1] - pt[1]) ** 2;
    if (d < bestD) { bestD = d; best = f.properties.id; }
  }
  return best;
}

const lines = fs.readFileSync(input, 'utf8').split('\n');
const byCountry = Object.fromEntries(COUNTRIES.map((c) => [c, []]));
for (const l of lines) {
  const c = l.split('\t');
  if (c.length < 15) continue;
  if (!byCountry[c[8]]) continue;
  if (c[6] !== 'P' || !KEEP_FCODE.has(c[7])) continue;
  // Korean name straight from GeoNames alternatenames (Hangul), suffix stripped.
  const han = /[가-힣]/;
  const ko = (c[3] || '').split(',').find((a) => han.test(a));
  byCountry[c[8]].push({
    geonameid: c[0],
    name: c[2],
    nameLocal: c[1],
    // strip only a trailing administrative suffix: " 시"/" 현" (JP style, space-led)
    // or kanji 市/県 — never bare 시/부/도 (parts of names like 의정부).
    nameKo: ko ? ko.replace(/(\s+[시현]|[市県])$/u, '').trim() : null,
    fcode: c[7],
    lat: parseFloat(c[4]),
    lng: parseFloat(c[5]),
    pop: parseInt(c[14] || '0', 10),
  });
}

const report = {};
for (const cc of COUNTRIES) {
  const regions = JSON.parse(
    fs.readFileSync(path.join(DATA, `regions.${cc.toLowerCase()}.json`), 'utf8'),
  ).features;
  const ranked = byCountry[cc].sort((a, b) => b.pop - a.pop);
  const out = [];
  const seen = new Set();
  const monocityUsed = new Set();
  for (const city of ranked) {
    if (out.length >= TOP_N || seen.has(city.name)) continue;
    const regionId = resolveRegion([city.lng, city.lat], regions);
    // metropolis regions: keep only the metropolis itself (its districts would
    // otherwise flood the list as separate "cities").
    if (MONOCITY_REGIONS.has(regionId)) {
      if (monocityUsed.has(regionId)) continue;
      monocityUsed.add(regionId);
    }
    // drop near-duplicates (GeoNames variant romanizations at ~same coords)
    if (out.some((o) => km(o.position, [city.lng, city.lat]) < 8)) continue;
    seen.add(city.name);
    out.push({
      id: `geon-${city.geonameid}`,
      regionId,
      country: cc,
      name: city.name,
      nameLocal: city.nameLocal,
      ...(city.nameKo ? { nameKo: city.nameKo } : {}),
      position: [city.lng, city.lat],
    });
  }
  fs.writeFileSync(path.join(DATA, `cities.${cc.toLowerCase()}.json`), JSON.stringify(out));
  report[cc] = out.length;
}
console.log('cities written:', JSON.stringify(report));
