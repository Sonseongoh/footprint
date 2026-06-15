/**
 * Generates the static OG/social share card (public/og-image.png, 1200×630).
 * Draws a real orthographic globe from src/data/world.json with KR/JP/TH glowing
 * gold — the same look as the in-app entry globe. Re-run after brand changes:
 *   node scripts/build-og.js
 *
 * Text in the image is Latin only (system fonts); Korean copy lives in the HTML
 * <meta> tags (src/app/+html.tsx) so it never depends on a CJK font here.
 */
const fs = require('fs');
const path = require('path');
const { geoOrthographic } = require('d3-geo');
const { Resvg } = require('@resvg/resvg-js');

const W = 1200;
const H = 630;
const cx = 880;
const cy = 315;
const R = 280;
const CENTER = [127, 34];
const ACTIVE = new Set(['KR', 'JP', 'TH']);

const DEG = Math.PI / 180;
function angle(a, b) {
  const [l1, p1] = [a[0] * DEG, a[1] * DEG];
  const [l2, p2] = [b[0] * DEG, b[1] * DEG];
  const s = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return Math.acos(Math.min(1, Math.max(-1, s))) / DEG;
}
function rings(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
  return [];
}

const world = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/world.json'), 'utf8'));
// geoPath's clipAngle output breaks resvg, so project manually + drop back-facing
// points (same approach as the in-app globe).
const projection = geoOrthographic().scale(R).translate([cx, cy]).rotate([-CENTER[0], -CENTER[1]]);

let land = '';
for (const f of world.features) {
  const active = ACTIVE.has(f.properties.iso);
  for (const ring of rings(f.geometry)) {
    const pts = [];
    for (const c of ring) {
      if (angle(c, CENTER) > 89) continue;
      const xy = projection(c);
      if (xy) pts.push(`${xy[0].toFixed(1)},${xy[1].toFixed(1)}`);
    }
    if (pts.length > 2) {
      land += `<polygon points="${pts.join(' ')}" fill="${active ? '#F5C26B' : '#243049'}" stroke="#0B1020" stroke-width="0.4"/>`;
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0C1426"/>
      <stop offset="1" stop-color="#0A1830"/>
    </linearGradient>
    <radialGradient id="sea" cx="40%" cy="34%" r="78%">
      <stop offset="0" stop-color="#1F6F8B"/>
      <stop offset="55%" stop-color="#163A55"/>
      <stop offset="1" stop-color="#0D2236"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sea)"/>
  ${land}
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#3A4A63" stroke-width="2"/>
  <circle cx="96" cy="150" r="17" fill="#F5C26B"/>
  <text x="130" y="170" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" fill="#EAEEFB">footprint</text>
  <text x="98" y="252" font-family="Arial, Helvetica, sans-serif" font-size="33" font-weight="600" fill="#F5C26B">Collect the cities you've walked.</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  font: { loadSystemFonts: true },
}).render().asPng();

fs.mkdirSync(path.join(__dirname, '../public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../public/og-image.png'), png);
console.log('wrote public/og-image.png', png.length, 'bytes');
