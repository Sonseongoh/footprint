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
const TOP_N = 100;
const KEEP_FCODE = new Set(['PPLC', 'PPLA']); // capital + first-order admin seats
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
  byCountry[c[8]].push({
    geonameid: c[0],
    name: c[2],
    nameLocal: c[1],
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
  for (const city of ranked) {
    if (out.length >= TOP_N || seen.has(city.name)) continue;
    seen.add(city.name);
    out.push({
      id: `geon-${city.geonameid}`,
      regionId: resolveRegion([city.lng, city.lat], regions),
      country: cc,
      name: city.name,
      nameLocal: city.nameLocal,
      position: [city.lng, city.lat],
    });
  }
  fs.writeFileSync(path.join(DATA, `cities.${cc.toLowerCase()}.json`), JSON.stringify(out));
  report[cc] = out.length;
}
console.log('cities written:', JSON.stringify(report));
