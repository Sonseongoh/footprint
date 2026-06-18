/**
 * Seed dummy city notes for 부산 (krc-부산) as if left by several different users.
 *
 * Each fake author signs in anonymously, sets a nickname, checks in at 부산
 * (so the 7-day write gate passes), then posts a note — exactly the real flow,
 * so it goes through RLS like a genuine user. Run once:
 *
 *   node scripts/seed-busan-notes.js
 *
 * Uses the project's anon key from .env (the user's own Supabase). Safe: creates
 * normal rows you can delete later from the dashboard.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// minimal .env parser (avoid extra deps)
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / ANON_KEY in .env');
  process.exit(1);
}

const REGION = { country: 'KR', regionId: 'krc-부산', cityName: '부산', lat: 35.1796, lng: 129.075 };

const NOTES = [
  { nick: '해운대러버', body: '해운대 새벽 바다 산책 강추. 동백섬 한 바퀴 돌고 광안대교 야경까지 보면 완벽해요.' },
  { nick: '돼지국밥장인', body: '서면 돼지국밥 골목 가세요. 현지인은 수육백반 시켜서 정구지(부추) 듬뿍 넣어 먹어요.' },
  { nick: '감천산책', body: '감천문화마을은 평일 오전이 한산해서 사진 찍기 좋아요. 골목골목 계단 많으니 편한 신발 필수.' },
  { nick: '자갈치아지매', body: '자갈치시장에서 회 떠서 2층 초장집 가는 코스 잊지마세요. 곰장어도 별미.' },
  { nick: '전포커피', body: '전포 카페거리 분위기 좋고, 밤엔 광안리 해변 포장마차에서 한잔. 부산 야경 최고.' },
];

async function run() {
  for (const n of NOTES) {
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data: signIn, error: e1 } = await supabase.auth.signInAnonymously();
    if (e1) {
      console.error(`  ✗ ${n.nick}: 익명 로그인 실패 — ${e1.message}`);
      continue;
    }
    const userId = signIn.user.id;

    // nickname (profiles row is auto-created by the signup trigger → update it)
    const { error: e2 } = await supabase.from('profiles').update({ display_name: n.nick }).eq('id', userId);
    if (e2) console.error(`  · ${n.nick}: 닉네임 설정 경고 — ${e2.message}`);

    // check in 부산 (satisfies the 7-day write gate)
    const { error: e3 } = await supabase.from('visit_events').insert({
      user_id: userId,
      region_id: REGION.regionId,
      country: REGION.country,
      city_name: REGION.cityName,
      lat: REGION.lat,
      lng: REGION.lng,
      accuracy_m: 20,
      source: 'live',
    });
    if (e3) {
      console.error(`  ✗ ${n.nick}: 체크인 실패 — ${e3.message}`);
      await supabase.auth.signOut();
      continue;
    }

    // post the note
    const { error: e4 } = await supabase.from('city_notes').insert({
      user_id: userId,
      country: REGION.country,
      region_id: REGION.regionId,
      city_name: REGION.cityName,
      body: n.body,
    });
    if (e4) console.error(`  ✗ ${n.nick}: 메모 작성 실패 — ${e4.message}`);
    else console.log(`  ✓ ${n.nick} — 메모 작성 완료`);

    await supabase.auth.signOut();
  }
  console.log('done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
