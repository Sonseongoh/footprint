/**
 * Korean display-name overlay (curated).
 *
 * The bundled region/city JSON keeps authoritative ENGLISH names from the source
 * datasets. Korean names live here as a separate, reviewable overlay so the two
 * never get mixed up. Display resolves Korean when present, else falls back to
 * English. A language toggle (later) picks English vs Korean.
 *
 * Coverage: KR complete; JP prefecture capitals; TH major destinations. Anything
 * not listed shows its English name until added here. Standard 외래어 표기법.
 */
import type { CountryCode } from '@/types/domain';

/** Region id → Korean short name. */
export const REGION_KO: Record<string, string> = {
  // KR — 시·도
  'KR-11': '서울', 'KR-21': '부산', 'KR-22': '대구', 'KR-23': '인천', 'KR-24': '광주',
  'KR-25': '대전', 'KR-26': '울산', 'KR-29': '세종', 'KR-31': '경기', 'KR-32': '강원',
  'KR-33': '충북', 'KR-34': '충남', 'KR-35': '전북', 'KR-36': '전남', 'KR-37': '경북',
  'KR-38': '경남', 'KR-39': '제주',
  // JP — 주요 도도부현
  'JP-13': '도쿄', 'JP-27': '오사카', 'JP-23': '아이치', 'JP-01': '홋카이도', 'JP-40': '후쿠오카',
  'JP-14': '가나가와', 'JP-28': '효고', 'JP-26': '교토', 'JP-11': '사이타마', 'JP-34': '히로시마',
  'JP-12': '지바', 'JP-22': '시즈오카', 'JP-47': '오키나와',
  // TH — 주요 주
  'TH-10': '방콕', 'TH-50': '치앙마이', 'TH-83': '푸켓', 'TH-81': '끄라비', 'TH-20': '촌부리',
  'TH-57': '치앙라이', 'TH-84': '수랏타니',
};

/** Per-country English city name → Korean. */
export const CITY_KO: Record<CountryCode, Record<string, string>> = {
  KR: {
    Seoul: '서울', Busan: '부산', Incheon: '인천', Daegu: '대구', Daejeon: '대전',
    Gwangju: '광주', Suwon: '수원', Ulsan: '울산', Changwon: '창원', 'Cheongju-si': '청주',
    Jeonju: '전주', 'Jeju City': '제주', Sejong: '세종', Chuncheon: '춘천', Andong: '안동',
    Muan: '무안', Hongseong: '홍성',
  },
  JP: {
    Tokyo: '도쿄', Yokohama: '요코하마', Osaka: '오사카', Nagoya: '나고야', Sapporo: '삿포로',
    Fukuoka: '후쿠오카', Kobe: '고베', Kyoto: '교토', Saitama: '사이타마', Hiroshima: '히로시마',
    Sendai: '센다이', Chiba: '지바', Niigata: '니가타', Kumamoto: '구마모토', Okayama: '오카야마',
    Shizuoka: '시즈오카', Kagoshima: '가고시마', Kanazawa: '가나자와', Nagasaki: '나가사키',
    Nara: '나라', 'Nara-shi': '나라', Naha: '나하', Matsuyama: '마쓰야마', Takamatsu: '다카마쓰',
    Gifu: '기후', Toyama: '도야마', Nagano: '나가노', Oita: '오이타', Miyazaki: '미야자키',
    Wakayama: '와카야마', Akita: '아키타', Aomori: '아오모리', Morioka: '모리오카',
  },
  TH: {
    Bangkok: '방콕', 'Chiang Mai': '치앙마이', Phuket: '푸켓', Krabi: '끄라비', 'Chiang Rai': '치앙라이',
    'Surat Thani': '수랏타니', 'Nakhon Ratchasima': '나콘라차시마', 'Chon Buri': '촌부리',
    'Udon Thani': '우돈타니', 'Khon Kaen': '콘깬', Rayong: '라용', 'Hua Hin': '후아힌',
    'Phra Nakhon Si Ayutthaya': '아유타야', Pattaya: '파타야', Songkhla: '송클라',
  },
};

export function regionNameKo(regionId: string, fallbackEnglish: string): string {
  return REGION_KO[regionId] ?? fallbackEnglish;
}

export function cityNameKo(country: CountryCode, englishName: string): string {
  return CITY_KO[country]?.[englishName] ?? englishName;
}
