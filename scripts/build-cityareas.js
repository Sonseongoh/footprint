/**
 * JP/TH 도시 경계(cityareas) 빌드 — 한국 모델(도시 폴리곤 = 수집 단위)로 통일하기 위한 파이프라인.
 *
 *   0. 원본 다운로드 (최초 1회):
 *      curl -sL -o tmp_geo/jp_municipalities.json https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_210101.json
 *      curl -sL -o tmp_geo/th_adm2.geojson      https://raw.githubusercontent.com/piyayut-ch/mapthai/master/data-raw/geojson/th_adm2.geojson
 *   1. node scripts/build-cityareas.js          # 추출·병합·검증 → tmp_geo/*_pre.json
 *   2. (스크립트가 안내하는) mapshaper 명령으로 dissolve → src/data/cityareas.{jp,th}.json
 *
 * 출처(배포 시 고지 필요):
 *   - 일본: 国土交通省 국토수치정보 N03 (smartnews-smri/japan-topography 1% 단순화판)
 *   - 태국: Royal Thai Survey Department / UNOCHA COD-AB (piyayut-ch/mapthai 단순화판)
 *
 * 매핑 검증: 기존 도시 포인트가 병합된 폴리곤 안에 들어가는지 전수 확인 —
 * 이름 매핑이 틀리면 여기서 바로 걸린다.
 */
const fs = require('fs');
const path = require('path');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;

const TMP = path.join(__dirname, '..', 'tmp_geo');
const DATA = path.join(__dirname, '..', 'src', 'data');

// ── 일본: 우리 도시 → 시구정촌 매핑 ──────────────────────────────────────────
// merge: 'wards23' = 도쿄 특별구 병합, 'city' = N03_003(정령시) 또는 N03_004 일치
// GeoNames 잡음 교체: Aihara→사가미하라, Minato(JP-30?!)→와카야마, Shinagawa(JP-38?!)→삭제
const JP_MAP = [
  { en: 'Sapporo', ja: '札幌市', ko: '삿포로', regionId: 'JP-01' },
  { en: 'Asahikawa', ja: '旭川市', ko: '아사히카와', regionId: 'JP-01' },
  { en: 'Hakodate', ja: '函館市', ko: '하코다테', regionId: 'JP-01' },
  { en: 'Otaru', ja: '小樽市', ko: '오타루', regionId: 'JP-01' },
  { en: 'Aomori', ja: '青森市', ko: '아오모리', regionId: 'JP-02' },
  { en: 'Morioka', ja: '盛岡市', ko: '모리오카', regionId: 'JP-03' },
  { en: 'Sendai', ja: '仙台市', ko: '센다이', regionId: 'JP-04' },
  { en: 'Akita', ja: '秋田市', ko: '아키타', regionId: 'JP-05' },
  { en: 'Yamagata', ja: '山形市', ko: '야마가타', regionId: 'JP-06' },
  { en: 'Iwaki', ja: 'いわき市', ko: '이와키', regionId: 'JP-07' },
  { en: 'Koriyama', ja: '郡山市', ko: '고리야마', regionId: 'JP-07' },
  { en: 'Fukushima', ja: '福島市', ko: '후쿠시마', regionId: 'JP-07' },
  { en: 'Mito', ja: '水戸市', ko: '미토', regionId: 'JP-08' },
  { en: 'Utsunomiya', ja: '宇都宮市', ko: '우쓰노미야', regionId: 'JP-09' },
  { en: 'Nikko', ja: '日光市', ko: '닛코', regionId: 'JP-09' },
  { en: 'Takasaki', ja: '高崎市', ko: '다카사키', regionId: 'JP-10' },
  { en: 'Maebashi', ja: '前橋市', ko: '마에바시', regionId: 'JP-10' },
  { en: 'Saitama', ja: 'さいたま市', ko: '사이타마', regionId: 'JP-11' },
  { en: 'Kawaguchi', ja: '川口市', ko: '가와구치', regionId: 'JP-11' },
  { en: 'Kawagoe', ja: '川越市', ko: '가와고에', regionId: 'JP-11' },
  { en: 'Koshigaya', ja: '越谷市', ko: '고시가야', regionId: 'JP-11' },
  { en: 'Tokorozawa', ja: '所沢市', ko: '도코로자와', regionId: 'JP-11' },
  { en: 'Chiba', ja: '千葉市', ko: '지바', regionId: 'JP-12' },
  { en: 'Matsudo', ja: '松戸市', ko: '마쓰도', regionId: 'JP-12' },
  { en: 'Kashiwa', ja: '柏市', ko: '가시와', regionId: 'JP-12' },
  { en: 'Ichihara', ja: '市原市', ko: '이치하라', regionId: 'JP-12' },
  { en: 'Tokyo', ja: '東京23区', ko: '도쿄', regionId: 'JP-13', merge: 'wards23' },
  { en: 'Yokohama', ja: '横浜市', ko: '요코하마', regionId: 'JP-14' },
  { en: 'Kawasaki', ja: '川崎市', ko: '가와사키', regionId: 'JP-14' },
  { en: 'Sagamihara', ja: '相模原市', ko: '사가미하라', regionId: 'JP-14', position: [139.3542, 35.5714] },
  { en: 'Fujisawa', ja: '藤沢市', ko: '후지사와', regionId: 'JP-14' },
  { en: 'Yokosuka', ja: '横須賀市', ko: '요코스카', regionId: 'JP-14' },
  { en: 'Hiratsuka', ja: '平塚市', ko: '히라쓰카', regionId: 'JP-14' },
  { en: 'Hakone', ja: '箱根町', ko: '하코네', regionId: 'JP-14' },
  { en: 'Kamakura', ja: '鎌倉市', ko: '가마쿠라', regionId: 'JP-14' },
  { en: 'Niigata', ja: '新潟市', ko: '니가타', regionId: 'JP-15' },
  { en: 'Nagaoka', ja: '長岡市', ko: '나가오카', regionId: 'JP-15' },
  { en: 'Toyama', ja: '富山市', ko: '도야마', regionId: 'JP-16' },
  { en: 'Kanazawa', ja: '金沢市', ko: '가나자와', regionId: 'JP-17' },
  { en: 'Fukui', ja: '福井市', ko: '후쿠이', regionId: 'JP-18', alias: 'Fukui-shi' },
  { en: 'Kofu', ja: '甲府市', ko: '고후', regionId: 'JP-19' },
  { en: 'Nagano', ja: '長野市', ko: '나가노', regionId: 'JP-20' },
  { en: 'Gifu', ja: '岐阜市', ko: '기후', regionId: 'JP-21' },
  { en: 'Takayama', ja: '高山市', ko: '다카야마', regionId: 'JP-21' },
  { en: 'Hamamatsu', ja: '浜松市', ko: '하마마쓰', regionId: 'JP-22' },
  { en: 'Shizuoka', ja: '静岡市', ko: '시즈오카', regionId: 'JP-22' },
  { en: 'Nagoya', ja: '名古屋市', ko: '나고야', regionId: 'JP-23' },
  { en: 'Toyota', ja: '豊田市', ko: '도요타', regionId: 'JP-23' },
  { en: 'Okazaki', ja: '岡崎市', ko: '오카자키', regionId: 'JP-23' },
  { en: 'Ichinomiya', ja: '一宮市', ko: '이치노미야', regionId: 'JP-23' },
  { en: 'Toyohashi', ja: '豊橋市', ko: '도요하시', regionId: 'JP-23' },
  { en: 'Kasugai', ja: '春日井市', ko: '가스가이', regionId: 'JP-23' },
  { en: 'Yokkaichi', ja: '四日市市', ko: '욧카이치', regionId: 'JP-24' },
  { en: 'Tsu', ja: '津市', ko: '쓰', regionId: 'JP-24' },
  { en: 'Otsu', ja: '大津市', ko: '오쓰', regionId: 'JP-25' },
  { en: 'Kyoto', ja: '京都市', ko: '교토', regionId: 'JP-26' },
  { en: 'Osaka', ja: '大阪市', ko: '오사카', regionId: 'JP-27' },
  { en: 'Sakai', ja: '堺市', ko: '사카이', regionId: 'JP-27' },
  { en: 'Higashiosaka', ja: '東大阪市', ko: '히가시오사카', regionId: 'JP-27' },
  { en: 'Hirakata', ja: '枚方市', ko: '히라카타', regionId: 'JP-27' },
  { en: 'Toyonaka', ja: '豊中市', ko: '도요나카', regionId: 'JP-27' },
  { en: 'Kobe', ja: '神戸市', ko: '고베', regionId: 'JP-28' },
  { en: 'Himeji', ja: '姫路市', ko: '히메지', regionId: 'JP-28' },
  { en: 'Nishinomiya', ja: '西宮市', ko: '니시노미야', regionId: 'JP-28' },
  { en: 'Akashi', ja: '明石市', ko: '아카시', regionId: 'JP-28' },
  { en: 'Kakogawa', ja: '加古川市', ko: '가코가와', regionId: 'JP-28', alias: 'Kakogawacho-honmachi' },
  { en: 'Nara', ja: '奈良市', ko: '나라', regionId: 'JP-29', alias: 'Nara-shi' },
  { en: 'Wakayama', ja: '和歌山市', ko: '와카야마', regionId: 'JP-30', position: [135.1675, 34.226] },
  { en: 'Tottori', ja: '鳥取市', ko: '돗토리', regionId: 'JP-31' },
  { en: 'Matsue', ja: '松江市', ko: '마쓰에', regionId: 'JP-32' },
  { en: 'Okayama', ja: '岡山市', ko: '오카야마', regionId: 'JP-33' },
  { en: 'Kurashiki', ja: '倉敷市', ko: '구라시키', regionId: 'JP-33' },
  { en: 'Hiroshima', ja: '広島市', ko: '히로시마', regionId: 'JP-34' },
  { en: 'Fukuyama', ja: '福山市', ko: '후쿠야마', regionId: 'JP-34' },
  { en: 'Shimonoseki', ja: '下関市', ko: '시모노세키', regionId: 'JP-35' },
  { en: 'Tokushima', ja: '徳島市', ko: '도쿠시마', regionId: 'JP-36' },
  { en: 'Takamatsu', ja: '高松市', ko: '다카마쓰', regionId: 'JP-37' },
  { en: 'Matsuyama', ja: '松山市', ko: '마쓰야마', regionId: 'JP-38' },
  { en: 'Kochi', ja: '高知市', ko: '고치', regionId: 'JP-39' },
  { en: 'Fukuoka', ja: '福岡市', ko: '후쿠오카', regionId: 'JP-40' },
  { en: 'Kitakyushu', ja: '北九州市', ko: '기타큐슈', regionId: 'JP-40' },
  { en: 'Kurume', ja: '久留米市', ko: '구루메', regionId: 'JP-40' },
  { en: 'Saga', ja: '佐賀市', ko: '사가', regionId: 'JP-41' },
  { en: 'Nagasaki', ja: '長崎市', ko: '나가사키', regionId: 'JP-42' },
  { en: 'Kumamoto', ja: '熊本市', ko: '구마모토', regionId: 'JP-43' },
  { en: 'Oita', ja: '大分市', ko: '오이타', regionId: 'JP-44' },
  { en: 'Miyazaki', ja: '宮崎市', ko: '미야자키', regionId: 'JP-45' },
  { en: 'Kagoshima', ja: '鹿児島市', ko: '가고시마', regionId: 'JP-46' },
  { en: 'Naha', ja: '那覇市', ko: '나하', regionId: 'JP-47' },
];

// ── 태국: 우리 도시 → 암프(郡) 매핑 ─────────────────────────────────────────
// district 미지정 = 'Mueang <주도명>' 자동. merge:'province' = 방콕(주 전체 병합).
// 잡음 교체: Ban Na(TH-64)→수코타이 / 삭제: Ban I Chang, Ban Mai, Bang Lamung(파타야와 중복)
const TH_MAP = [
  { en: 'Bangkok', ko: '방콕', regionId: 'TH-10', merge: 'province' },
  { en: 'Samut Prakan', ko: '사뭇쁘라깐', regionId: 'TH-11' },
  { en: 'Phra Pradaeng', ko: '프라쁘라댕', regionId: 'TH-11', district: 'Phra Pradaeng' },
  { en: 'Nonthaburi', ko: '논타부리', regionId: 'TH-12', alias: 'Mueang Nonthaburi' },
  { en: 'Bang Bua Thong', ko: '방부아통', regionId: 'TH-12', district: 'Bang Bua Thong' },
  { en: 'Khlong Luang', ko: '클롱루앙', regionId: 'TH-13', district: 'Khlong Luang' },
  { en: 'Lam Luk Ka', ko: '람룩까', regionId: 'TH-13', district: 'Lam Luk Ka', alias: 'Ban Lam Luk Ka' },
  { en: 'Ayutthaya', ko: '아유타야', regionId: 'TH-14', district: 'Phra Nakhon Si Ayutthaya', alias: 'Phra Nakhon Si Ayutthaya' },
  { en: 'Ang Thong', ko: '앙통', regionId: 'TH-15' },
  { en: 'Lop Buri', ko: '롭부리', regionId: 'TH-16' },
  { en: 'Sing Buri', ko: '싱부리', regionId: 'TH-17' },
  { en: 'Chainat', ko: '차이낫', regionId: 'TH-18' },
  { en: 'Saraburi', ko: '사라부리', regionId: 'TH-19' },
  { en: 'Phra Phutthabat', ko: '프라풋타밧', regionId: 'TH-19', district: 'Phra Phutthabat' },
  { en: 'Nong Khae', ko: '농캐', regionId: 'TH-19', district: 'Nong Khae' },
  { en: 'Chon Buri', ko: '촌부리', regionId: 'TH-20' },
  { en: 'Si Racha', ko: '시라차', regionId: 'TH-20', district: 'Si Racha' },
  { en: 'Pattaya', ko: '파타야', regionId: 'TH-20', district: 'Bang Lamung' },
  { en: 'Sattahip', ko: '사타힙', regionId: 'TH-20', district: 'Sattahip' },
  { en: 'Rayong', ko: '라용', regionId: 'TH-21' },
  { en: 'Klaeng', ko: '끌랭', regionId: 'TH-21', district: 'Klaeng' },
  { en: 'Chanthaburi', ko: '짠타부리', regionId: 'TH-22' },
  { en: 'Trat', ko: '뜨랏', regionId: 'TH-23' },
  { en: 'Chachoengsao', ko: '차청사오', regionId: 'TH-24' },
  { en: 'Kabin Buri', ko: '까빈부리', regionId: 'TH-25', district: 'Kabin Buri' },
  { en: 'Si Maha Phot', ko: '시마하폿', regionId: 'TH-25', district: 'Si Maha Phot' },
  { en: 'Prachantakham', ko: '쁘라짠따캄', regionId: 'TH-25', district: 'Prachantakham' },
  { en: 'Na Di', ko: '나디', regionId: 'TH-25', district: 'Na Di' },
  { en: 'Nakhon Nayok', ko: '나콘나욕', regionId: 'TH-26' },
  { en: 'Sa Kaeo', ko: '사깨오', regionId: 'TH-27' },
  { en: 'Nakhon Ratchasima', ko: '나콘랏차시마', regionId: 'TH-30' },
  { en: 'Pak Chong', ko: '빡총', regionId: 'TH-30', district: 'Pak Chong' },
  { en: 'Buriram', ko: '부리람', regionId: 'TH-31', district: 'Mueang Buri Ram' },
  { en: 'Surin', ko: '수린', regionId: 'TH-32' },
  { en: 'Si Sa Ket', ko: '시사껫', regionId: 'TH-33' },
  { en: 'Ubon Ratchathani', ko: '우본랏차타니', regionId: 'TH-34' },
  { en: 'Yasothon', ko: '야소톤', regionId: 'TH-35' },
  { en: 'Chaiyaphum', ko: '차이야품', regionId: 'TH-36' },
  { en: 'Amnat Charoen', ko: '암낫짜른', regionId: 'TH-37' },
  { en: 'Bueng Kan', ko: '븡칸', regionId: 'TH-38' },
  { en: 'Nong Bua Lamphu', ko: '농부아람푸', regionId: 'TH-39' },
  { en: 'Khon Kaen', ko: '콘깬', regionId: 'TH-40' },
  { en: 'Chum Phae', ko: '춤패', regionId: 'TH-40', district: 'Chum Phae' },
  { en: 'Udon Thani', ko: '우돈타니', regionId: 'TH-41' },
  { en: 'Loei', ko: '르이', regionId: 'TH-42' },
  { en: 'Nong Khai', ko: '농카이', regionId: 'TH-43' },
  { en: 'Maha Sarakham', ko: '마하사라캄', regionId: 'TH-44' },
  { en: 'Roi Et', ko: '로이엣', regionId: 'TH-45' },
  { en: 'Kalasin', ko: '깔라신', regionId: 'TH-46' },
  { en: 'Sakon Nakhon', ko: '사꼰나콘', regionId: 'TH-47' },
  { en: 'Nakhon Phanom', ko: '나콘파놈', regionId: 'TH-48' },
  { en: 'Mukdahan', ko: '묵다한', regionId: 'TH-49' },
  { en: 'Chiang Mai', ko: '치앙마이', regionId: 'TH-50' },
  { en: 'Lamphun', ko: '람푼', regionId: 'TH-51' },
  { en: 'Lampang', ko: '람빵', regionId: 'TH-52' },
  { en: 'Uttaradit', ko: '우따라딧', regionId: 'TH-53' },
  { en: 'Phrae', ko: '프래', regionId: 'TH-54' },
  { en: 'Nan', ko: '난', regionId: 'TH-55' },
  { en: 'Phayao', ko: '파야오', regionId: 'TH-56' },
  { en: 'Chiang Rai', ko: '치앙라이', regionId: 'TH-57' },
  { en: 'Mae Hong Son', ko: '매홍손', regionId: 'TH-58' },
  { en: 'Nakhon Sawan', ko: '나콘사완', regionId: 'TH-60' },
  { en: 'Uthai Thani', ko: '우타이타니', regionId: 'TH-61' },
  { en: 'Kamphaeng Phet', ko: '깜팽펫', regionId: 'TH-62' },
  { en: 'Mae Sot', ko: '매솟', regionId: 'TH-63', district: 'Mae Sot' },
  { en: 'Sukhothai', ko: '수코타이', regionId: 'TH-64', position: [99.8230, 17.0078] },
  { en: 'Phitsanulok', ko: '핏사눌록', regionId: 'TH-65' },
  { en: 'Phichit', ko: '피칫', regionId: 'TH-66' },
  { en: 'Phetchabun', ko: '펫차분', regionId: 'TH-67' },
  { en: 'Ratchaburi', ko: '랏차부리', regionId: 'TH-70' },
  { en: 'Ban Pong', ko: '반뽕', regionId: 'TH-70', district: 'Ban Pong' },
  { en: 'Kanchanaburi', ko: '깐짜나부리', regionId: 'TH-71' },
  { en: 'Tha Maka', ko: '타마카', regionId: 'TH-71', district: 'Tha Maka' },
  { en: 'Suphan Buri', ko: '수판부리', regionId: 'TH-72' },
  { en: 'Nakhon Pathom', ko: '나콘빠톰', regionId: 'TH-73' },
  { en: 'Krathum Baen', ko: '끄라툼밴', regionId: 'TH-74', district: 'Krathum Baen' },
  { en: 'Samut Sakhon', ko: '사뭇사콘', regionId: 'TH-74' },
  { en: 'Ban Phaeo', ko: '반패오', regionId: 'TH-74', district: 'Ban Phaeo' },
  { en: 'Samut Songkhram', ko: '사뭇송크람', regionId: 'TH-75' },
  { en: 'Cha-am', ko: '차암', regionId: 'TH-76', district: 'Cha-am' },
  { en: 'Phetchaburi', ko: '펫차부리', regionId: 'TH-76' },
  { en: 'Tha Yang', ko: '타양', regionId: 'TH-76', district: 'Tha Yang' },
  { en: 'Hua Hin', ko: '후아힌', regionId: 'TH-77', district: 'Hua Hin' },
  { en: 'Pran Buri', ko: '쁘란부리', regionId: 'TH-77', district: 'Pran Buri' },
  { en: 'Nakhon Si Thammarat', ko: '나콘시탐마랏', regionId: 'TH-80' },
  { en: 'Krabi', ko: '끄라비', regionId: 'TH-81' },
  { en: 'Phang Nga', ko: '팡아', regionId: 'TH-82' },
  { en: 'Phuket', ko: '푸껫', regionId: 'TH-83' },
  { en: 'Surat Thani', ko: '수랏타니', regionId: 'TH-84' },
  { en: 'Ko Samui', ko: '코사무이', regionId: 'TH-84', district: 'Ko Samui' },
  { en: 'Ranong', ko: '라농', regionId: 'TH-85' },
  { en: 'Chumphon', ko: '춤폰', regionId: 'TH-86' },
  { en: 'Hat Yai', ko: '핫야이', regionId: 'TH-90', district: 'Hat Yai' },
  { en: 'Sadao', ko: '사다오', regionId: 'TH-90', district: 'Sadao' },
  { en: 'Songkhla', ko: '송클라', regionId: 'TH-90', district: 'Mueang Songkhla', position: [100.5951, 7.1988] },
  { en: 'Satun', ko: '사뚠', regionId: 'TH-91' },
  { en: 'Trang', ko: '뜨랑', regionId: 'TH-92' },
  { en: 'Phatthalung', ko: '팟탈룽', regionId: 'TH-93' },
  { en: 'Pattani', ko: '빠따니', regionId: 'TH-94' },
  { en: 'Yala', ko: '얄라', regionId: 'TH-95' },
  { en: 'Narathiwat', ko: '나라티왓', regionId: 'TH-96' },
  { en: 'Su-ngai Kolok', ko: '승아이꼴록', regionId: 'TH-96', district: 'Su-ngai Kolok' },
];

// 주 이름 (Mueang <X> 자동 매칭용) — regions.th.json의 영문명
const TH_PROVINCE_NAME = (() => {
  const th = require('../src/data/regions.th.json');
  const m = {};
  for (const f of th.features) m[f.properties.id] = f.properties.name;
  return m;
})();

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

// 기존 도시 포인트 (검증용 위치)
function cityPositions() {
  const all = [
    ...require('../src/data/cities.jp.json'),
    ...require('../src/data/cities-extra.jp.json'),
    ...require('../src/data/cities.th.json'),
    ...require('../src/data/cities-extra.th.json'),
  ];
  const m = new Map();
  for (const c of all) m.set(`${c.country}:${c.name}`, c.position);
  return m;
}

function run() {
  const positions = cityPositions();
  let problems = 0;

  // ── JP ──
  const jpSrc = JSON.parse(fs.readFileSync(path.join(TMP, 'jp_municipalities.json'), 'utf8'));
  const jpOut = [];
  for (const m of JP_MAP) {
    const pref = m.regionId.slice(3); // 'JP-14' → '14'
    let parts;
    if (m.merge === 'wards23') {
      parts = jpSrc.features.filter(
        (f) => f.properties.N03_007?.startsWith('13') && /^131/.test(f.properties.N03_007),
      ); // 13101~13123 특별구
    } else {
      parts = jpSrc.features.filter(
        (f) =>
          f.properties.N03_007?.startsWith(pref) &&
          (f.properties.N03_003 === m.ja || f.properties.N03_004 === m.ja),
      );
    }
    if (parts.length === 0) {
      console.log(`❌ JP ${m.en} (${m.ja}): 매칭 0건`);
      problems++;
      continue;
    }
    const id = `jpc-${slug(m.en)}`;
    for (const f of parts) {
      jpOut.push({
        type: 'Feature',
        properties: { id, country: 'JP', name: m.ko, nameLocal: m.en, regionId: m.regionId },
        geometry: f.geometry,
      });
    }
    // 검증: 도시 포인트가 병합 폴리곤 중 하나 안에 있는가
    const pos = m.position ?? positions.get(`JP:${m.alias ?? m.en}`);
    if (pos) {
      const inside = parts.some((f) => booleanPointInPolygon(pos, f));
      if (!inside) console.log(`⚠️ JP ${m.en}: 도시 포인트가 폴리곤 밖 (해안 단순화 가능성) — 확인 필요`);
    } else {
      console.log(`· JP ${m.en}: 검증 포인트 없음 (신규 항목)`);
    }
  }

  // ── TH ──
  const thSrc = JSON.parse(fs.readFileSync(path.join(TMP, 'th_adm2.geojson'), 'utf8'));
  const thOut = [];
  for (const m of TH_MAP) {
    const provCode = m.regionId.replace('-', ''); // 'TH-20' → 'TH20'
    let parts;
    if (m.merge === 'province') {
      parts = thSrc.features.filter((f) => f.properties.ADM1_PCODE === provCode);
    } else {
      const want = norm(m.district ?? `Mueang ${TH_PROVINCE_NAME[m.regionId] ?? ''}`);
      parts = thSrc.features.filter(
        (f) => f.properties.ADM1_PCODE === provCode && norm(f.properties.ADM2_EN) === want,
      );
      // 'Mueang X' 표기 변형 (띄어쓰기 차이) 대응: 주 내에서 mueang으로 시작하는 것 1개면 그걸로
      if (parts.length === 0 && !m.district) {
        const mueang = thSrc.features.filter(
          (f) => f.properties.ADM1_PCODE === provCode && norm(f.properties.ADM2_EN).startsWith('mueang'),
        );
        if (mueang.length === 1) parts = mueang;
      }
    }
    if (parts.length === 0) {
      console.log(`❌ TH ${m.en}: 매칭 0건 (district=${m.district ?? 'Mueang ' + TH_PROVINCE_NAME[m.regionId]})`);
      problems++;
      continue;
    }
    const id = `thc-${slug(m.en)}`;
    for (const f of parts) {
      thOut.push({
        type: 'Feature',
        properties: { id, country: 'TH', name: m.ko, nameLocal: m.en, regionId: m.regionId },
        geometry: f.geometry,
      });
    }
    const pos = m.position ?? positions.get(`TH:${m.alias ?? m.en}`);
    if (pos) {
      const inside = parts.some((f) => booleanPointInPolygon(pos, f));
      if (!inside) console.log(`⚠️ TH ${m.en}: 도시 포인트가 폴리곤 밖 — 확인 필요`);
    } else {
      console.log(`· TH ${m.en}: 검증 포인트 없음 (신규 항목)`);
    }
  }

  fs.writeFileSync(path.join(TMP, 'jp_pre.json'), JSON.stringify({ type: 'FeatureCollection', features: jpOut }));
  fs.writeFileSync(path.join(TMP, 'th_pre.json'), JSON.stringify({ type: 'FeatureCollection', features: thOut }));

  const uniq = (arr) => new Set(arr.map((f) => f.properties.id)).size;
  console.log(`\nJP: 도시 ${uniq(jpOut)}개 (${jpOut.length} 조각) → tmp_geo/jp_pre.json`);
  console.log(`TH: 도시 ${uniq(thOut)}개 (${thOut.length} 조각) → tmp_geo/th_pre.json`);
  console.log(problems ? `\n❌ 매칭 실패 ${problems}건 — 위 로그 확인` : '\n✅ 전 도시 매칭 성공');
  console.log(`\n다음 단계 (dissolve + 출력):
  npx -y mapshaper tmp_geo/jp_pre.json -dissolve2 id copy-fields=country,name,nameLocal,regionId -clean -o precision=0.0001 src/data/cityareas.jp.json
  npx -y mapshaper tmp_geo/th_pre.json -dissolve2 id copy-fields=country,name,nameLocal,regionId -clean -o precision=0.0001 src/data/cityareas.th.json`);
}

run();
