/**
 * Seed dummy 여행 공유 across KR / JP / TH so every screen has realistic content
 * (infinite scroll, 추천순/최신순, likes, multi-country maps, share pages).
 *
 *   node scripts/seed-notes.js
 *
 * REAL RLS FLOW for every note: sign up/in (dummy account) → check in to that
 * city → post. Anonymous accounts can no longer write (0014_guest_readonly), so
 * authors are real (non-anonymous) accounts on a reserved .local domain — no
 * inbox exists and nothing is ever sent. Needs Supabase Auth → "Confirm email"
 * OFF while seeding.
 *
 * TRAVELER MIX — authors are not interchangeable. Each dummy account is assigned
 * a travel profile (KR-only, JP-only, TH-only, two countries, all three) in a
 * realistic ratio, and only writes notes for cities in its own countries. That
 * makes the collection maps and share pages differ per user the way real ones do.
 *
 * ⚠️ like_count / created_at are written directly to vary the seed. Once
 * 0017_lock_note_counters.sql is applied those columns are system-owned; the
 * script then falls back to inserting author columns only (system defaults for
 * likes/date). Seed the values you want BEFORE applying 0017.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / ANON_KEY in .env');
  process.exit(1);
}

const EMAIL_DOMAIN = 'seed.footprint.local';
const PASSWORD = 'seed-footprint-2026';

/**
 * Traveler profiles. Ratio roughly mirrors who'd use a KR-made travel app:
 * mostly domestic travelers, a solid Japan crowd, fewer Thailand-only, and a
 * small set of heavy travelers who've done all three.
 */
const PROFILES = [
  { countries: ['KR'], count: 18 }, // 한국만
  { countries: ['JP'], count: 12 }, // 일본만
  { countries: ['TH'], count: 8 }, // 태국만
  { countries: ['KR', 'JP'], count: 9 },
  { countries: ['KR', 'TH'], count: 4 },
  { countries: ['JP', 'TH'], count: 3 },
  { countries: ['KR', 'JP', 'TH'], count: 6 }, // 3개국 완주
];

/** One unique nickname per dummy account (profiles.display_name is unique since 0016). */
const NICKNAMES = [
  '느긋한너구리', '설레는수달', '씩씩한펭귄', '부지런한여우', '잔잔한고래',
  '포근한사슴', '상냥한올빼미', '용감한나그네', '다정한참새', '엉뚱한판다',
  '든든한알파카', '반짝이는해달', '은은한두루미', '따뜻한코알라', '산뜻한다람쥐',
  '활기찬고슴도치', '고요한바다표범', '햇살같은두더지', '길따라걷는사람', '골목수집가',
  '야경헌터', '시장구경꾼', '카페탐험대', '노을맛집', '새벽산책러',
  '지도덕후', '기차여행자', '뚜벅이여행', '사진찍는사람', '먹부림전문',
  '바다보는사람', '산길타는중', '온천마니아', '야시장러버', '골목라이더',
  '느린여행자', '주말탈출러', '배낭메고', '숲길산책', '섬여행중독',
  '노포탐험가', '해변수집가', '사찰순례자', '스쿠터여행', '로컬버스러',
  '식도락가', '별보러가는길', '벚꽃따라', '단풍쫓기', '눈꽃여행',
  '커피순례', '빵집투어', '전통시장', '야경사냥꾼', '골목사진관',
  '휴양지선호', '액티비티파', '박물관러버', '거리음악', '느낌표여행',
];

// notes: [body, likeCount, daysAgo]
const CITIES = [
  // ── 🇰🇷 한국 ──
  {
    country: 'KR', regionId: 'krc-부산', cityName: '부산', lat: 35.1796, lng: 129.075,
    notes: [
      ['광안리 밤바다 보면서 맥주 한 캔. 다리 조명 쇼는 매시 정각에 잠깐 해요.', 42, 2],
      ['서면 돼지국밥 골목 — 새벽까지 하는 집 많아요. 수육백반에 정구지 듬뿍.', 38, 5],
      ['감천문화마을은 오전 일찍 가면 한산해요. 어린왕자 포토존은 줄이 길어요.', 35, 1],
      ['해운대보다 송정 해변이 한적해요. 서핑 강습도 여기서 받았어요.', 31, 8],
      ['자갈치시장 1층에서 회 떠서 2층 초장집으로. 곰장어 꼭 드세요.', 29, 3],
      ['전포 카페거리 골목이 예뻐요. 작은 로스터리들이 진짜예요.', 27, 12],
      ['영도 흰여울문화마을 절벽길 뷰가 좋아요. 영화 많이 찍은 곳.', 24, 6],
      ['여름엔 밀면이죠. 가야밀면 줄 서요. 비빔도 물도 다 괜찮아요.', 22, 15],
      ['황령산 봉수대 야경 강추. 차 있으면 밤에 올라가세요. 부산 전체가 보여요.', 20, 4],
      ['태종대 다누비 열차 타고 한 바퀴. 등대랑 절벽 뷰가 시원해요.', 12, 18],
      ['보수동 책방골목 — 헌책 냄새 좋아하면 한 시간은 순삭이에요.', 6, 40],
      ['다대포 일몰과 꿈의낙조분수. 여름밤 분수쇼 볼만해요.', 5, 14],
    ],
  },
  {
    country: 'KR', regionId: 'krc-서울', cityName: '서울', lat: 37.5665, lng: 126.978,
    notes: [
      ['북촌 한옥마을은 평일 오전이 조용해요. 주민 사는 곳이라 조용히 다녀요.', 40, 3],
      ['을지로 노가리 골목 — 저녁 6시 넘으면 야외 테이블 꽉 차요.', 34, 7],
      ['성수동 연무장길 카페·편집숍 많아요. 대림창고 근처부터 걸어보세요.', 28, 10],
      ['남산타워는 케이블카보다 걸어 올라가는 길이 예뻐요. 야경 좋아요.', 25, 5],
      ['광장시장 빈대떡·마약김밥. 평일 낮에 가야 자리 있어요.', 19, 16],
      ['뚝섬한강공원에서 러닝하고 편의점 라면. 이게 서울 감성이에요.', 15, 21],
      ['서촌 골목 서점이랑 작은 갤러리들. 경복궁 서쪽이라 조용해요.', 11, 28],
    ],
  },
  {
    country: 'KR', regionId: 'krc-제주시', cityName: '제주', lat: 33.4996, lng: 126.5312,
    notes: [
      ['사려니숲길 아침 산책 강추. 안개 낀 날이 더 좋아요.', 33, 4],
      ['흑돼지는 관광지보다 동네 고깃집이 나아요. 멜젓에 찍어서.', 26, 9],
      ['한라산 성판악 코스는 새벽 출발 필수. 정상 대피소에서 컵라면.', 21, 13],
      ['협재 해수욕장 물색이 진짜 에메랄드. 오후 늦게 사람 빠져요.', 17, 20],
      ['애월 해안도로 카페들. 뷰값이라도 한 번은 가볼 만해요.', 9, 26],
    ],
  },
  {
    country: 'KR', regionId: 'krc-경주시', cityName: '경주', lat: 35.8562, lng: 129.2247,
    notes: [
      ['첨성대·대릉원 야간 조명 예뻐요. 자전거 빌려서 도는 게 최고.', 31, 3],
      ['불국사는 이른 아침에. 석굴암까지 걸어 올라가면 한 시간쯤.', 24, 8],
      ['황리단길 한옥 카페들. 주말엔 사람 많으니 평일 추천.', 18, 14],
      ['보문호수 벚꽃길 산책. 봄에 오면 진짜 미쳐요.', 12, 22],
      ['경주빵보다 찰보리빵이 더 맛있어요. 개인 취향이지만요.', 7, 30],
    ],
  },
  {
    country: 'KR', regionId: 'krc-전주시', cityName: '전주', lat: 35.8242, lng: 127.148,
    notes: [
      ['한옥마을은 아침 8시가 제일 좋아요. 낮엔 사람 반, 상점 반.', 29, 5],
      ['진짜 콩나물국밥은 남부시장 쪽. 수란 풀어서 먹는 게 정석.', 23, 11],
      ['전동성당 앞 야경 예뻐요. 한복 대여점 근처라 사람 많지만요.', 16, 17],
      ['가맥집 문화 재밌어요. 슈퍼에서 맥주 사서 황태구이랑.', 10, 25],
    ],
  },
  {
    country: 'KR', regionId: 'krc-강릉시', cityName: '강릉', lat: 37.7519, lng: 128.8761,
    notes: [
      ['안목해변 커피거리 — 바다 보면서 마시는 커피가 왜 이렇게 맛있죠.', 30, 2],
      ['경포대 일출 보려면 새벽 5시. 겨울엔 사람도 적고 공기 맑아요.', 22, 9],
      ['초당 순두부 마을. 짬뽕순두부 파는 집이 웨이팅 길어요.', 17, 15],
      ['정동진 바다부채길 트레킹. 절벽 따라 걷는 길이 시원해요.', 11, 24],
    ],
  },
  {
    country: 'KR', regionId: 'krc-여수시', cityName: '여수', lat: 34.7604, lng: 127.6622,
    notes: [
      ['여수 밤바다는 진짜예요. 돌산대교 조명 켜지면 노래가 절로 나와요.', 28, 4],
      ['게장백반 정식 — 간장게장 무한리필 하는 집들 많아요.', 20, 12],
      ['해상케이블카 크리스탈 캐빈 타보세요. 바닥이 유리라 아찔해요.', 14, 19],
      ['오동도 동백꽃은 2~3월. 방파제 걸어서 들어가요.', 8, 27],
    ],
  },
  {
    country: 'KR', regionId: 'krc-속초시', cityName: '속초', lat: 38.207, lng: 128.5918,
    notes: [
      ['속초중앙시장 닭강정 — 줄 서더라도 갓 튀긴 거 드세요.', 26, 6],
      ['설악산 울산바위 코스는 계단 지옥이지만 정상 뷰가 보상해줘요.', 19, 13],
      ['아바이마을 갯배 타보세요. 손으로 줄 당겨서 건너는 거 재밌어요.', 12, 21],
      ['영금정 일출 명소. 바다 바로 앞이라 파도 소리가 좋아요.', 6, 33],
    ],
  },
  {
    country: 'KR', regionId: 'krc-통영시', cityName: '통영', lat: 34.8544, lng: 128.4331,
    notes: [
      ['동피랑 벽화마을 — 골목 좁으니 조용히 다녀요. 주민 사는 곳이에요.', 25, 7],
      ['통영 충무김밥은 시장 안 노포가 진짜. 어묵이랑 무김치 조합.', 18, 14],
      ['한산도 가는 배 타고 이순신 유적지. 뱃길 자체가 여행이에요.', 11, 23],
      ['미륵산 케이블카 타면 다도해가 쫙 펼쳐져요. 날 맑을 때 가세요.', 7, 31],
    ],
  },

  // ── 🇯🇵 일본 ──
  {
    country: 'JP', regionId: 'jpc-tokyo', cityName: '도쿄', lat: 35.6895, lng: 139.6917,
    notes: [
      ['시부야 스크램블은 스타벅스 2층에서 보는 게 제일 잘 보여요.', 45, 2],
      ['신주쿠 골든가이 근처 라멘집들. 자판기로 주문하는 곳이 대부분이에요.', 37, 6],
      ['센소지는 아침 7시에 가면 사람 거의 없어요. 나카미세 상점가는 9시부터.', 30, 11],
      ['시모키타자와 빈티지숍 골목. 하루 종일 돌아도 안 지겨워요.', 23, 17],
      ['츠키지 장외시장 아침 식사. 계란말이랑 참치덮밥 줄 서요.', 18, 24],
      ['야나카 긴자 상점가 — 옛 도쿄 분위기. 고양이 많아요.', 10, 31],
    ],
  },
  {
    country: 'JP', regionId: 'jpc-osaka', cityName: '오사카', lat: 34.6937, lng: 135.5023,
    notes: [
      ['도톤보리 글리코 간판 앞은 항상 사람 많아요. 밤에 조명 켜지면 예뻐요.', 39, 3],
      ['타코야키는 체인보다 골목 노점이 나아요. 갓 구운 거 뜨거우니 조심.', 32, 8],
      ['오사카성 천수각보다 주변 공원이 좋아요. 벚꽃 시즌엔 인산인해.', 22, 14],
      ['쿠로몬시장에서 해산물 구이. 그 자리에서 먹을 수 있어요.', 16, 19],
      ['신세카이 츠텐카쿠 주변 쿠시카츠 골목. 소스 두 번 찍기 금지예요.', 8, 27],
    ],
  },
  {
    country: 'JP', regionId: 'jpc-kyoto', cityName: '교토', lat: 35.0116, lng: 135.7681,
    notes: [
      ['후시미이나리 천 개의 토리이 — 새벽 6시 가면 아무도 없어요. 강추.', 44, 1],
      ['아라시야마 대나무숲은 오전 8시 전에. 늦으면 사진 못 찍어요.', 36, 5],
      ['기온 하나미코지 저녁 산책. 게이코 사진 촬영은 금지라 조심하세요.', 27, 12],
      ['철학의 길 벚꽃 시즌 최고. 은각사까지 천천히 걸어보세요.', 19, 22],
      ['니시키시장 먹거리 골목. 두유 도넛이랑 절임 반찬 맛있어요.', 13, 29],
    ],
  },
  {
    country: 'JP', regionId: 'jpc-fukuoka', cityName: '후쿠오카', lat: 33.5904, lng: 130.4017,
    notes: [
      ['나카스 포장마차(야타이)는 저녁 6시부터. 라멘이랑 명란 계란말이.', 34, 4],
      ['이치란 본점보다 동네 돈코츠 라멘집이 더 진해요. 카에다마 꼭.', 27, 10],
      ['다자이후 텐만구는 전철로 30분. 매화 시즌이 예뻐요.', 20, 16],
      ['오호리 공원 산책 + 후쿠오카성터. 현지인 조깅 코스예요.', 13, 23],
      ['모모치 해변 노을. 후쿠오카 타워랑 같이 보면 좋아요.', 8, 32],
    ],
  },
  {
    country: 'JP', regionId: 'jpc-sapporo', cityName: '삿포로', lat: 43.0621, lng: 141.3544,
    notes: [
      ['스스키노 징기스칸 — 양고기 냄새 걱정했는데 전혀 안 나요.', 33, 5],
      ['오타루 운하까지 전철로 40분. 겨울 눈 쌓인 풍경이 그림이에요.', 26, 12],
      ['삿포로 맥주 박물관 시음 코스. 갓 뽑은 생맥주 맛이 달라요.', 19, 18],
      ['니조시장 해산물 덮밥. 성게·연어알 올린 거 강추.', 12, 26],
      ['모이와야마 야경 — 일본 3대 야경이라던데 진짜 예뻐요.', 7, 35],
    ],
  },
  {
    // 폴리곤 모델에선 섬이 아니라 도시가 게시판 — 오키나와가 아닌 나하
    country: 'JP', regionId: 'jpc-naha', cityName: '나하', lat: 26.2124, lng: 127.6809,
    notes: [
      ['마키시 공설시장 1층에서 해산물 사면 2층 식당에서 조리해줘요. 아침에 가야 싱싱해요.', 31, 6],
      ['슈리성 성벽 산책로는 무료예요. 복원 공사 과정을 공개하는 것도 볼거리.', 24, 13],
      ['츠보야 야치문(도자기) 거리 — 국제거리에서 걸어서 10분인데 분위기가 확 조용해져요.', 16, 20],
      ['국제거리보다 뒷골목 이자카야가 좋아요. 오키나와 소바 꼭.', 10, 28],
    ],
  },
  {
    country: 'JP', regionId: 'jpc-nagoya', cityName: '나고야', lat: 35.1815, lng: 136.9066,
    notes: [
      ['히츠마부시(장어덮밥) — 세 가지 방식으로 먹는 게 재밌어요.', 28, 7],
      ['나고야성 천수각은 공사 중일 수 있어요. 혼마루 어전은 볼만해요.', 18, 15],
      ['오스 상점가 — 전자상가랑 빈티지숍 섞여 있어요. 구경거리 많아요.', 11, 24],
      ['미소카츠는 호불호 갈려요. 저는 좋았는데 짜다는 사람도 많아요.', 6, 34],
    ],
  },

  // ── 🇹🇭 태국 ──
  {
    country: 'TH', regionId: 'thc-bangkok', cityName: '방콕', lat: 13.7563, lng: 100.5018,
    notes: [
      ['짜뚜짝 주말시장은 아침 일찍. 오후엔 더워서 못 돌아다녀요.', 41, 4],
      ['왓아룬은 강 건너에서 보는 야경이 더 예뻐요. 배 타고 건너세요.', 34, 7],
      ['카오산로드는 밤에 가야 제맛. 팟타이 노점 저렴해요.', 26, 13],
      ['루프탑 바는 드레스코드 있어요. 반바지·슬리퍼 안 됩니다.', 20, 18],
      ['담넌사두억 수상시장은 투어로 가는 게 편해요. 아침 일찍 출발.', 12, 25],
    ],
  },
  {
    country: 'TH', regionId: 'thc-chiangmai', cityName: '치앙마이', lat: 18.7883, lng: 98.9853,
    notes: [
      ['치앙마이 올드시티는 자전거로 도는 게 좋아요. 사원이 골목마다 있어요.', 35, 3],
      ['도이수텝 사원 — 썽태우 타고 올라가요. 해질녘 뷰가 좋아요.', 29, 9],
      ['님만해민 카페거리. 노마드들 많아서 와이파이 잘 돼요.', 23, 15],
      ['일요일 워킹스트리트 야시장. 수공예품 저렴하고 먹거리 많아요.', 17, 20],
      ['카오소이는 치앙마이가 본고장. 로컬 식당이 진짜 맛있어요.', 11, 26],
    ],
  },
  {
    country: 'TH', regionId: 'thc-phuket', cityName: '푸껫', lat: 7.8804, lng: 98.3923,
    notes: [
      ['빠통은 번잡해요. 조용한 거 원하면 까따·까론 해변으로.', 30, 6],
      ['피피섬 투어는 스피드보트보다 페리가 덜 흔들려요. 멀미약 챙기세요.', 25, 11],
      ['푸켓 올드타운 포르투갈풍 건물들. 일요일엔 워킹스트리트 열려요.', 18, 17],
      ['빅부다 전망대에서 섬 전체가 보여요. 오토바이 렌트하면 편해요.', 10, 23],
    ],
  },
  {
    country: 'TH', regionId: 'thc-pattaya', cityName: '파타야', lat: 12.9236, lng: 100.8825,
    notes: [
      ['꼬란섬 당일치기 추천. 방콕에서 가까운데 물은 훨씬 맑아요.', 27, 5],
      ['진리의 성전(Sanctuary of Truth) — 통나무 조각이 압도적이에요.', 20, 12],
      ['워킹스트리트는 호불호 확실해요. 가족 여행이면 패스.', 13, 19],
      ['농눅빌리지 정원 넓어요. 반나절은 잡아야 해요.', 7, 29],
    ],
  },
  {
    country: 'TH', regionId: 'thc-krabi', cityName: '끄라비', lat: 8.0863, lng: 98.9063,
    notes: [
      ['라일레이 비치는 배로만 갈 수 있어요. 그래서 더 조용해요.', 29, 4],
      ['에메랄드 풀 + 온천 폭포 코스. 물색이 진짜 에메랄드예요.', 21, 14],
      ['아오낭에서 4섬 투어. 롱테일보트가 스피드보트보다 운치 있어요.', 15, 21],
      ['타이거 케이브 사원 계단 1237개… 올라가면 후회 안 해요.', 9, 30],
    ],
  },
  {
    country: 'TH', regionId: 'thc-ayutthaya', cityName: '아유타야', lat: 14.3532, lng: 100.5689,
    notes: [
      ['왓 마하탓 나무뿌리 불상 머리 — 사진 찍을 때 머리보다 낮게 앉아야 해요.', 26, 8],
      ['자전거 빌려서 유적 도는 게 최고. 하루면 충분해요.', 18, 16],
      ['방콕에서 기차로 1시간 반. 3등석도 나쁘지 않아요.', 11, 22],
      ['일몰 때 왓 차이왓타나람이 붉게 물들어요. 강 건너에서 보세요.', 6, 31],
    ],
  },
];

/** Build the account roster: each entry = { idx, nick, countries }. */
function buildRoster() {
  const roster = [];
  let i = 0;
  for (const p of PROFILES) {
    for (let k = 0; k < p.count; k++) {
      roster.push({ idx: i, nick: NICKNAMES[i], countries: p.countries });
      i += 1;
    }
  }
  if (i > NICKNAMES.length) throw new Error(`닉네임 부족: ${i} 필요, ${NICKNAMES.length} 있음`);
  return roster;
}

const roster = buildRoster();

/**
 * Assign each city's notes to authors who actually travel to that country,
 * round-robin within the eligible pool so no author repeats inside one city.
 */
function planAssignments() {
  const cursor = {}; // country → next eligible-author index
  const plan = [];
  for (const city of CITIES) {
    const eligible = roster.filter((r) => r.countries.includes(city.country));
    cursor[city.country] = cursor[city.country] ?? 0;
    city.notes.forEach((note, n) => {
      const author = eligible[(cursor[city.country] + n) % eligible.length];
      plan.push({ city, note, author });
    });
    cursor[city.country] += city.notes.length;
  }
  return plan;
}

const clients = new Map();
async function authorClient(a) {
  if (clients.has(a.idx)) return clients.get(a.idx);

  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  const email = `seed${a.idx + 1}@${EMAIL_DOMAIN}`;

  let { data, error } = await supabase.auth.signUp({ email, password: PASSWORD });
  if (error && /already registered|already been registered/i.test(error.message)) {
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD }));
  }
  if (error) {
    if (/rate limit/i.test(error.message)) {
      throw new Error('auth rate limit — Auth → Rate Limits 한도를 올리거나 1시간 뒤 재실행 (기존 글은 건너뜁니다).');
    }
    throw new Error(`auth: ${error.message}`);
  }
  if (!data.session) {
    throw new Error('가입 세션이 없어요 — Supabase Auth의 "Confirm email"을 끄고 다시 실행하세요.');
  }

  const entry = { supabase, userId: data.user.id, named: false };
  clients.set(a.idx, entry);
  return entry;
}

/** Bodies that already exist per region — makes re-runs skip what's done. */
async function existingBodies() {
  const anon = createClient(URL, KEY, { auth: { persistSession: false } });
  const seen = new Set();
  const { data } = await anon
    .from('city_notes')
    .select('region_id, body')
    .in('region_id', CITIES.map((c) => c.regionId));
  for (const r of data ?? []) seen.add(`${r.region_id}::${r.body}`);
  return seen;
}

async function run() {
  const now = Date.now();
  const done = await existingBodies();
  const plan = planAssignments();

  const mix = PROFILES.map((p) => `${p.countries.join('+')} ${p.count}명`).join(' · ');
  console.log(`여행자 구성: ${mix}  (총 ${roster.length}명)`);
  console.log(`계획: ${plan.length}개 글 / ${CITIES.length}개 도시\n`);

  let ok = 0, fail = 0, skip = 0;

  for (const { city, note, author } of plan) {
    const [body, likes, daysAgo] = note;
    if (done.has(`${city.regionId}::${body}`)) {
      skip += 1;
      continue;
    }

    try {
      const a = await authorClient(author);
      const { supabase, userId } = a;
      const createdAt = new Date(now - daysAgo * 86_400_000).toISOString();

      if (!a.named) {
        await supabase.from('profiles').update({ display_name: author.nick }).eq('id', userId);
        a.named = true;
      }

      // real check-in first — city_notes RLS requires a visit within 7 days
      const { error: e1 } = await supabase.from('visit_events').insert({
        user_id: userId,
        region_id: city.regionId,
        country: city.country,
        city_name: city.cityName,
        lat: city.lat,
        lng: city.lng,
        accuracy_m: 20,
        source: 'live',
      });
      if (e1) throw new Error(`check-in: ${e1.message}`);

      const base = {
        user_id: userId,
        country: city.country,
        region_id: city.regionId,
        city_name: city.cityName,
        body,
      };
      // like_count / created_at become system-owned after 0017 → fall back
      let { error: e2 } = await supabase
        .from('city_notes')
        .insert({ ...base, like_count: likes, created_at: createdAt, updated_at: createdAt });
      let locked = false;
      if (e2 && /permission denied|column/i.test(e2.message)) {
        locked = true;
        ({ error: e2 } = await supabase.from('city_notes').insert(base));
      }
      if (e2) throw new Error(`note: ${e2.message}`);

      ok += 1;
      const tag = locked ? '(기본값)' : `♥${likes} · ${daysAgo}일 전`;
      console.log(`  ✓ [${city.cityName}] ${author.nick} — ${tag}`);
    } catch (e) {
      fail += 1;
      console.error(`  ✗ [${city.cityName}] ${author.nick}: ${e.message}`);
    }
  }

  for (const { supabase } of clients.values()) await supabase.auth.signOut().catch(() => {});
  console.log(`\ndone. ${ok} 생성, ${skip} 건너뜀, ${fail} 실패 (인증 ${clients.size}회)`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
