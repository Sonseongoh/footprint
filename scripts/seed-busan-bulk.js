/**
 * Bulk-seed ~20 dummy 여행 공유 for 부산 with varied like counts and dates, so the
 * city screen has enough to test infinite scroll + 추천순/신규순 sorting + likes.
 *
 *   node scripts/seed-busan-bulk.js
 *
 * Each note is posted by a fresh anonymous user (real RLS flow: sign in → check in
 * 부산 → post). like_count and created_at are set directly on the row (the author
 * can update their own note) purely to vary the seed — no real like rows are made.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

// [nickname, body, likeCount, daysAgo]
const NOTES = [
  ['바다보는개발자', '광안리 밤바다 보면서 맥주 한 캔. 다리 조명 쇼는 매시 정각에 잠깐 해요.', 42, 2],
  ['국밥순례자', '서면 돼지국밥 골목 — 새벽까지 하는 집 많아요. 수육백반에 정구지 듬뿍.', 38, 5],
  ['감천러버', '감천문화마을은 오전 일찍 가면 한산. 어린왕자 포토존 줄 길어요.', 35, 1],
  ['해운대주민', '해운대보다 송정 해변이 한적하고 좋아요. 서핑 강습도 여기서.', 31, 8],
  ['자갈치단골', '자갈치시장 1층에서 회 떠서 2층 초장집. 곰장어 꼭 드세요.', 29, 3],
  ['전포카페투어', '전포 카페거리 골목골목 예뻐요. 노티드도 좋지만 작은 로스터리들이 진짜.', 27, 12],
  ['부산토박이', '흰여울문화마을 — 영도 절벽길 따라 걷는 뷰가 미쳤어요. 영화 많이 찍은 곳.', 24, 6],
  ['밀면덕후', '여름엔 밀면이죠. 가야밀면, 내호냉면 둘 다 줄서요. 비빔도 물도 다 굿.', 22, 15],
  ['야경헌터', '황령산 봉수대 야경 강추. 차 있으면 밤에 올라가세요. 부산 전체가 보임.', 20, 4],
  ['미술관산책', '부산현대미술관 + 을숙도 생태공원 코스. 낙동강 노을이 예술이에요.', 18, 22],
  ['온천여행', '동래온천에서 몸 풀고 온천천 벚꽃길 산책. 봄에 진짜 예뻐요.', 16, 30],
  ['시장구경꾼', '국제시장-부평깡통시장 야시장. 비빔당면이랑 씨앗호떡 필수.', 14, 9],
  ['절경마니아', '태종대 다누비 열차 타고 한 바퀴. 등대랑 절벽 뷰 좋아요.', 12, 18],
  ['커피한잔', '영도 흰여울 근처 오션뷰 카페들 많아요. 통유리로 바다 보면서 멍.', 11, 7],
  ['빵지순례', '초량 이바구길 + 168계단 모노레일. 옛 부산 감성 그대로예요.', 9, 25],
  ['낚시인생', '다대포 해수욕장 일몰 + 꿈의낙조분수. 여름밤 분수쇼 볼만해요.', 8, 11],
  ['보수동책방', '보수동 책방골목 — 헌책 냄새 좋아하면 한 시간은 순삭이에요.', 6, 40],
  ['광안대교밤', '민락수변공원에서 회 포장해서 노을 보며 먹기. 현지인 코스.', 5, 14],
  ['산복도로', '산복도로 버스 타고 부산 골목 풍경 구경. 천천히 도는 게 매력.', 3, 33],
  ['첫부산여행', '처음이면 해운대-광안리-감천 기본 코스부터. 지하철로 다 닿아요.', 1, 19],
];

async function run() {
  const now = Date.now();
  let ok = 0;
  for (const [nick, body, likes, daysAgo] of NOTES) {
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data: signIn, error: e1 } = await supabase.auth.signInAnonymously();
    if (e1) {
      console.error(`  ✗ ${nick}: 로그인 실패 — ${e1.message}`);
      continue;
    }
    const userId = signIn.user.id;
    const createdAt = new Date(now - daysAgo * 86_400_000).toISOString();

    await supabase.from('profiles').update({ display_name: nick }).eq('id', userId);
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
      console.error(`  ✗ ${nick}: 체크인 실패 — ${e3.message}`);
      await supabase.auth.signOut();
      continue;
    }
    const { error: e4 } = await supabase.from('city_notes').insert({
      user_id: userId,
      country: REGION.country,
      region_id: REGION.regionId,
      city_name: REGION.cityName,
      body,
      like_count: likes,
      created_at: createdAt,
      updated_at: createdAt,
    });
    if (e4) console.error(`  ✗ ${nick}: 작성 실패 — ${e4.message}`);
    else {
      ok += 1;
      console.log(`  ✓ ${nick} — ♥${likes} · ${daysAgo}일 전`);
    }
    await supabase.auth.signOut();
  }
  console.log(`done. ${ok}/${NOTES.length} 생성`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
