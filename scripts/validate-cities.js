/**
 * 도시 데이터 전수 검증 — 도시별 게시판 전환 전 필수 점검.
 *   node scripts/validate-cities.js
 *
 * 검사 항목:
 *  1. id 중복 / regionId가 지역 파일에 실존하는지
 *  2. 좌표가 자기 regionId 폴리곤 안에 있는지 (밖이면 폴리곤까지 근사 거리 — 해안
 *     단순화로 살짝 밖인 건 OK, 멀면 배정 오류)
 *  3. 같은 이름 중복 / 좌표 중복(<1km)
 *  4. 한국어 이름 누락 — JSON nameKo 와 names-ko.ts의 CITY_KO 오버레이를 합산해
 *     "실제로 영문으로 노출되는" 도시만 보고
 *  5. 도시가 하나도 없는 지역 목록 (40km 스냅 상한과 결합 시 "도시 수집 불가" 지역)
 *  6. cities-extra 파일도 병합해 함께 검증
 */
const fs = require('fs');
const path = require('path');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;

/** names-ko.ts의 CITY_KO에서 나라별 키를 추출 (오버레이 커버리지 반영용). */
function overlayKeys(country) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'names-ko.ts'), 'utf8');
  const block = src.slice(src.indexOf('CITY_KO'), src.indexOf('REGION_KO', src.indexOf('CITY_KO')));
  const start = block.indexOf(`${country}: {`);
  if (start < 0) return new Set();
  let depth = 0;
  let end = start;
  for (let i = block.indexOf('{', start); i < block.length; i++) {
    if (block[i] === '{') depth++;
    if (block[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const keys = new Set();
  for (const m of block.slice(start, end).matchAll(/(?:'([^']+)'|([A-Za-z][\w-]*))\s*:/g)) {
    keys.add(m[1] ?? m[2]);
  }
  keys.delete(country);
  return keys;
}

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** 폴리곤 꼭짓점까지의 최소 거리 (점-폴리곤 거리의 근사 — 신호용) */
function distToPolygonKm(pos, feature) {
  let best = Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      const d = km(pos, c);
      if (d < best) best = d;
    } else c.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  return best;
}

const SETS = {
  JP: {
    regions: require('../src/data/regions.jp.json'),
    cities: [...require('../src/data/cities.jp.json'), ...require('../src/data/cities-extra.jp.json')],
  },
  TH: {
    regions: require('../src/data/regions.th.json'),
    cities: [...require('../src/data/cities.th.json'), ...require('../src/data/cities-extra.th.json')],
  },
};

let problems = 0;

for (const [country, { regions, cities }] of Object.entries(SETS)) {
  console.log(`\n════ ${country} — 도시 ${cities.length}개 / 지역 ${regions.features.length}개 ════`);
  const regionById = new Map(regions.features.map((f) => [f.properties.id, f]));

  // 1) id 중복 + regionId 실존
  const ids = new Map();
  for (const c of cities) {
    ids.set(c.id, (ids.get(c.id) || 0) + 1);
    if (!regionById.has(c.regionId)) {
      console.log(`  ❌ ${c.nameKo ?? c.name}: regionId ${c.regionId} 가 지역 파일에 없음`);
      problems++;
    }
  }
  for (const [id, n] of ids) if (n > 1) (console.log(`  ❌ id 중복: ${id} ×${n}`), problems++);

  // 2) 폴리곤 포함/거리
  for (const c of cities) {
    const region = regionById.get(c.regionId);
    if (!region) continue;
    const inside = booleanPointInPolygon({ type: 'Point', coordinates: c.position }, region);
    if (!inside) {
      const d = distToPolygonKm(c.position, region);
      if (d > 15) {
        console.log(`  ❌ ${c.nameKo ?? c.name}: ${c.regionId} 폴리곤에서 ${d.toFixed(0)}km 벗어남 (배정 오류 의심)`);
        problems++;
      } else {
        console.log(`  · ${c.nameKo ?? c.name}: 폴리곤 밖 ${d.toFixed(1)}km (해안 단순화 — 허용)`);
      }
    }
  }

  // 3) 이름/좌표 중복
  const names = new Map();
  for (const c of cities) {
    const key = c.nameKo ?? c.name;
    if (names.has(key)) {
      console.log(`  ⚠️  이름 중복: ${key} (${names.get(key)} / ${c.id})`);
    } else names.set(key, c.id);
  }
  for (let i = 0; i < cities.length; i++)
    for (let j = i + 1; j < cities.length; j++)
      if (km(cities[i].position, cities[j].position) < 1) {
        console.log(`  ⚠️  좌표 중복(<1km): ${cities[i].name} vs ${cities[j].name}`);
      }

  // 4) 한국어 이름 누락 (JSON nameKo + CITY_KO 오버레이 합산 — 실노출 기준)
  const overlay = overlayKeys(country);
  const noKo = cities.filter((c) => !c.nameKo && !overlay.has(c.name));
  if (noKo.length) {
    console.log(`  ⚠️  한국어 이름 없음 ${noKo.length}개 → UI에 영문 노출:`);
    console.log(`     ${noKo.map((c) => c.name).join(', ')}`);
    problems++;
  }

  // 5) 도시 없는 지역
  const covered = new Set(cities.map((c) => c.regionId));
  const empty = regions.features.filter((f) => !covered.has(f.properties.id));
  console.log(`  ⬜ 도시 0개 지역 ${empty.length}개: ${empty.map((f) => `${f.properties.id} ${f.properties.name}`).join(', ') || '없음'}`);
}

console.log(problems ? `\n❌ 배정/무결성 문제 ${problems}건` : '\n✅ 배정/무결성 문제 없음');
