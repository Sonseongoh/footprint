/**
 * Generates the footprint app icon + splash assets from src/data/world.json:
 * a navy globe with Korea/Japan/Thailand glowing gold (the in-app entry globe).
 * Re-run after brand tweaks:  node scripts/build-icons.js
 *
 * Outputs (assets/images/):
 *   icon.png                      1024  full-bleed app icon (iOS + fallback)
 *   android-icon-foreground.png   1024  adaptive foreground (subject in safe zone)
 *   android-icon-background.png   1024  adaptive background (solid navy)
 *   android-icon-monochrome.png   1024  themed-icon silhouette (white on clear)
 *   splash-icon.png                512  splash logo (transparent)
 */
const fs = require('fs');
const path = require('path');
const { geoOrthographic } = require('d3-geo');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '../assets/images');
const world = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/world.json'), 'utf8'));

const NAVY = '#0C1426';
const GOLD = '#F5C26B';
const SLATE = '#26324c';
const RIM = '#3A4A63';
// a few scattered gold "visited" countries (incl. Korea) — generic "been around"
// look, not tied to the app's supported list, so the icon never needs changing.
// Kept small & spread so it reads as dots, not a gold mass.
const ACTIVE = new Set(['KR', 'TH', 'NP', 'PH', 'UZ', 'KG']);
const CENTER = [115, 26]; // frame the scattered countries
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

/** land polygons projected onto a globe at (cx,cy) radius R */
function land(cx, cy, R, { activeColor = GOLD, otherColor = SLATE } = {}) {
  const proj = geoOrthographic().scale(R).translate([cx, cy]).rotate([-CENTER[0], -CENTER[1]]);
  let out = '';
  for (const f of world.features) {
    const active = ACTIVE.has(f.properties.iso);
    const color = active ? activeColor : otherColor;
    if (!color) continue;
    for (const ring of rings(f.geometry)) {
      const pts = [];
      for (const c of ring) {
        if (angle(c, CENTER) > 89) continue;
        const xy = proj(c);
        if (xy) pts.push(`${xy[0].toFixed(1)},${xy[1].toFixed(1)}`);
      }
      if (pts.length > 2) out += `<polygon points="${pts.join(' ')}" fill="${color}"/>`;
    }
  }
  return out;
}

function defs() {
  return `<defs>
    <radialGradient id="sea" cx="40%" cy="34%" r="80%">
      <stop offset="0" stop-color="#1F6F8B"/>
      <stop offset="55%" stop-color="#163A55"/>
      <stop offset="1" stop-color="#0D2236"/>
    </radialGradient>
  </defs>`;
}

/** the globe mark (sea + land + rim), centred at (cx,cy) radius R */
function globe(cx, cy, R) {
  return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sea)"/>
    ${land(cx, cy, R)}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${RIM}" stroke-width="${R * 0.012}"/>`;
}

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
function write(name, svg, size) {
  fs.writeFileSync(path.join(OUT, name), png(svg, size));
  console.log('  ', name, size);
}

// ── app icon: full-bleed navy square + globe ────────────────────────────────
write(
  'icon.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${defs()}
    <rect width="1024" height="1024" fill="${NAVY}"/>
    ${globe(512, 512, 384)}
  </svg>`,
  1024,
);

// ── android adaptive foreground: globe in the ~66% safe zone, transparent ────
write(
  'android-icon-foreground.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${defs()}
    ${globe(512, 512, 300)}
  </svg>`,
  1024,
);

// ── android adaptive background: solid navy ─────────────────────────────────
write(
  'android-icon-background.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${NAVY}"/></svg>`,
  1024,
);

// ── android monochrome (themed icon): white globe silhouette ────────────────
write(
  'android-icon-monochrome.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <circle cx="512" cy="512" r="300" fill="none" stroke="#ffffff" stroke-width="26"/>
    ${land(512, 512, 300, { activeColor: '#ffffff', otherColor: '' })}
  </svg>`,
  1024,
);

// ── splash logo: globe on transparent ───────────────────────────────────────
write(
  'splash-icon.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${defs()}
    ${globe(256, 256, 232)}
  </svg>`,
  512,
);

// ── web favicon: globe on navy ──────────────────────────────────────────────
write(
  'favicon.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="196" viewBox="0 0 196 196">
    ${defs()}
    <rect width="196" height="196" fill="${NAVY}"/>
    ${globe(98, 98, 90)}
  </svg>`,
  196,
);

console.log('icons written.');
