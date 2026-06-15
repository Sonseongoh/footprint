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
  // JP — 47 도도부현 (전부)
  'JP-01': '홋카이도', 'JP-02': '아오모리', 'JP-03': '이와테', 'JP-04': '미야기', 'JP-05': '아키타',
  'JP-06': '야마가타', 'JP-07': '후쿠시마', 'JP-08': '이바라키', 'JP-09': '도치기', 'JP-10': '군마',
  'JP-11': '사이타마', 'JP-12': '지바', 'JP-13': '도쿄', 'JP-14': '가나가와', 'JP-15': '니가타',
  'JP-16': '도야마', 'JP-17': '이시카와', 'JP-18': '후쿠이', 'JP-19': '야마나시', 'JP-20': '나가노',
  'JP-21': '기후', 'JP-22': '시즈오카', 'JP-23': '아이치', 'JP-24': '미에', 'JP-25': '시가',
  'JP-26': '교토', 'JP-27': '오사카', 'JP-28': '효고', 'JP-29': '나라', 'JP-30': '와카야마',
  'JP-31': '돗토리', 'JP-32': '시마네', 'JP-33': '오카야마', 'JP-34': '히로시마', 'JP-35': '야마구치',
  'JP-36': '도쿠시마', 'JP-37': '가가와', 'JP-38': '에히메', 'JP-39': '고치', 'JP-40': '후쿠오카',
  'JP-41': '사가', 'JP-42': '나가사키', 'JP-43': '구마모토', 'JP-44': '오이타', 'JP-45': '미야자키',
  'JP-46': '가고시마', 'JP-47': '오키나와',
  // TH — 77개 주 (전부)
  'TH-10': '방콕', 'TH-11': '사뭇쁘라깐', 'TH-12': '논타부리', 'TH-13': '빠툼타니', 'TH-14': '아유타야',
  'TH-15': '앙통', 'TH-16': '롭부리', 'TH-17': '싱부리', 'TH-18': '차이낫', 'TH-19': '사라부리',
  'TH-20': '촌부리', 'TH-21': '라용', 'TH-22': '짠타부리', 'TH-23': '뜨랏', 'TH-24': '차층사오',
  'TH-25': '쁘라찐부리', 'TH-26': '나콘나욕', 'TH-27': '사깨오', 'TH-30': '나콘라차시마', 'TH-31': '부리람',
  'TH-32': '수린', 'TH-33': '시사껫', 'TH-34': '우본라차타니', 'TH-35': '야소톤', 'TH-36': '차이야품',
  'TH-37': '암낫짜른', 'TH-38': '븡깐', 'TH-39': '농부아람푸', 'TH-40': '콘깬', 'TH-41': '우돈타니',
  'TH-42': '르이', 'TH-43': '농카이', 'TH-44': '마하사라캄', 'TH-45': '로이엣', 'TH-46': '깔라신',
  'TH-47': '사콘나콘', 'TH-48': '나콘파놈', 'TH-49': '묵다한', 'TH-50': '치앙마이', 'TH-51': '람푼',
  'TH-52': '람빵', 'TH-53': '웃따라딧', 'TH-54': '프래', 'TH-55': '난', 'TH-56': '파야오',
  'TH-57': '치앙라이', 'TH-58': '매홍손', 'TH-60': '나콘사완', 'TH-61': '우타이타니', 'TH-62': '깜팽펫',
  'TH-63': '딱', 'TH-64': '수코타이', 'TH-65': '핏사눌록', 'TH-66': '피칫', 'TH-67': '펫차분',
  'TH-70': '랏차부리', 'TH-71': '깐짜나부리', 'TH-72': '수판부리', 'TH-73': '나콘빠톰', 'TH-74': '사뭇사콘',
  'TH-75': '사뭇송크람', 'TH-76': '펫차부리', 'TH-77': '쁘라추업키리칸', 'TH-80': '나콘시탐마랏',
  'TH-81': '끄라비', 'TH-82': '팡응아', 'TH-83': '푸켓', 'TH-84': '수랏타니', 'TH-85': '라농',
  'TH-86': '춤폰', 'TH-90': '송클라', 'TH-91': '사뚠', 'TH-92': '뜨랑', 'TH-93': '팟탈룽',
  'TH-94': '빠따니', 'TH-95': '얄라', 'TH-96': '나라티왓',
};

/** Per-country English city name → Korean. */
export const CITY_KO: Record<CountryCode, Record<string, string>> = {
  KR: {
    Seoul: '서울', Busan: '부산', Incheon: '인천', Daegu: '대구', Daejeon: '대전',
    Gwangju: '광주', Suwon: '수원', Ulsan: '울산', 'Goyang-si': '고양', Changwon: '창원',
    'Cheongju-si': '청주', Jeonju: '전주', Pohang: '포항', 'Jeju City': '제주', Gumi: '구미',
    Sejong: '세종', Yangsan: '양산', Chuncheon: '춘천', Suncheon: '순천', Yeosu: '여수',
    Mokpo: '목포', 'Gyeongsan-si': '경산', Gwangyang: '광양', Andong: '안동', Boryeong: '보령',
    Muan: '무안', Hongseong: '홍성', Sokcho: '속초', Hwasun: '화순', Buyeo: '부여',
    Yecheon: '예천', Yeongam: '영암', Damyang: '담양', Yeongdong: '영동', Naju: '나주',
    Jangseong: '장성', Hadong: '하동', Boseong: '보성', Jangheung: '장흥', Hwacheon: '화천',
    Gyeongju: '경주', Gangneung: '강릉',
  },
  JP: {
    Tokyo: '도쿄', Yokohama: '요코하마', Osaka: '오사카', Nagoya: '나고야', Sapporo: '삿포로',
    Fukuoka: '후쿠오카', Kobe: '고베', Kyoto: '교토', Saitama: '사이타마', Hiroshima: '히로시마',
    Sendai: '센다이', Chiba: '지바', Niigata: '니가타', Kumamoto: '구마모토', Okayama: '오카야마',
    Shizuoka: '시즈오카', Kagoshima: '가고시마', Kanazawa: '가나자와', Nagasaki: '나가사키',
    Nara: '나라', 'Nara-shi': '나라', Naha: '나하', Matsuyama: '마쓰야마', Takamatsu: '다카마쓰',
    Gifu: '기후', Toyama: '도야마', Nagano: '나가노', Oita: '오이타', Miyazaki: '미야자키',
    Wakayama: '와카야마', Akita: '아키타', Aomori: '아오모리', Morioka: '모리오카',
    Hakone: '하코네', Kamakura: '가마쿠라', Nikko: '닛코', Takayama: '다카야마', Otaru: '오타루',
    Kawasaki: '가와사키', Kitakyushu: '기타큐슈', Sakai: '사카이', Hamamatsu: '하마마쓰', Ota: '오타',
    Sagamihara: '사가미하라', Kawaguchi: '가와구치', Hachioji: '하치오지', Himeji: '히메지',
    Utsunomiya: '우쓰노미야', Matsudo: '마쓰도', Higashiosaka: '히가시오사카', Nishinomiya: '니시노미야',
    Kurashiki: '구라시키', Fukuyama: '후쿠야마', Amagasaki: '아마가사키', Katsushika: '가쓰시카',
    Fujisawa: '후지사와', Kashiwa: '가시와', Machida: '마치다', Toyota: '도요타', Yokosuka: '요코스카',
    Hirakata: '히라카타', Toyonaka: '도요나카', Suita: '스이타', Okazaki: '오카자키',
    Ichinomiya: '이치노미야', Toyohashi: '도요하시', Takasaki: '다카사키', Iwaki: '이와키',
    Kawagoe: '가와고에', Takatsuki: '다카쓰키', Koshigaya: '고시가야', Otsu: '오쓰', Nakano: '나카노',
    Tokorozawa: '도코로자와', Asahikawa: '아사히카와', Maebashi: '마에바시', Kita: '기타', Kochi: '고치',
    Koriyama: '고리야마', Kasugai: '가스가이', Yokkaichi: '욧카이치', Akashi: '아카시', Kurume: '구루메',
    Fukushima: '후쿠시마', Ibaraki: '이바라키', Ichihara: '이치하라',
  },
  TH: {
    Bangkok: '방콕', 'Chiang Mai': '치앙마이', Phuket: '푸켓', Krabi: '끄라비', 'Chiang Rai': '치앙라이',
    'Surat Thani': '수랏타니', 'Nakhon Ratchasima': '나콘라차시마', 'Chon Buri': '촌부리',
    'Udon Thani': '우돈타니', 'Khon Kaen': '콘깬', Rayong: '라용', 'Hua Hin': '후아힌',
    'Phra Nakhon Si Ayutthaya': '아유타야', Pattaya: '파타야', Songkhla: '송클라',
    'Ko Samui': '코사무이',
    'Samut Prakan': '사뭇쁘라깐', 'Mueang Nonthaburi': '논타부리', 'Phra Pradaeng': '프라쁘라댕',
    'Hat Yai': '핫야이', 'Pak Kret': '빡끄렛', 'Si Racha': '시라차', Lampang: '람빵',
    'Kabin Buri': '까빈부리', 'Ubon Ratchathani': '우본라차타니', 'Nakhon Pathom': '나콘빠톰',
    'Khlong Luang': '클롱루앙', 'Nakhon Si Thammarat': '나콘시탐마랏', 'Si Maha Phot': '시마하폿',
    Chanthaburi: '짠타부리', Yala: '얄라', Ratchaburi: '랏차부리', 'Nakhon Sawan': '나콘사완',
    'Bang Kruai': '방끄루아이', 'Thawi Watthana': '타위왓타나', 'Sakon Nakhon': '사콘나콘',
    'Krathum Baen': '끄라툼밴', Saraburi: '사라부리', Trang: '뜨랑', Sattahip: '사따힙',
    Kanchanaburi: '깐짜나부리', 'Nong Khai': '농카이', 'Samut Sakhon': '사뭇사콘',
    Phitsanulok: '핏사눌록', Prachantakham: '쁘라짠타캄',
    // Bangkok 구(區) — 음역
    'Bang Khae': '방캐', 'Sai Mai': '사이마이', Watthana: '왓타나', 'Khlong Sam Wa': '클롱삼와',
    'Bang Khun Thian': '방쿤티안', 'Lat Krabang': '랏끄라방', Chatuchak: '짜뚜짝', 'Chom Thong': '쫌통',
    'Nong Chok': '농쪽', 'Nong Khaem': '농캠', 'Bang Kapi': '방까삐', 'Bueng Kum': '븡꿈',
    'Din Daeng': '딘댕', 'Bang Sue': '방쓰', 'Lat Phrao': '랏프라오', 'Phasi Charoen': '파시짜른',
    'Thon Buri': '톤부리', 'Bangkok Noi': '방콕너이', 'Thung Khru': '퉁크루', 'Suan Luang': '수안루앙',
    'Wang Thonglang': '왕통랑', 'Lak Si': '락씨', 'Khlong Toei': '클롱떠이', Dusit: '두씻',
    'Taling Chan': '탈링짠', 'Bang Bon': '방본', 'Bang Rak': '방락', 'Bang Na': '방나',
    'Bang Phlat': '방플랏', 'Phra Khanong': '프라카농', 'Saphan Sung': '사판숭', 'Khan Na Yao': '칸나야오',
    'Rat Burana': '랏부라나', Sathon: '사톤', 'Yan Nawa': '얀나와', 'Huai Khwang': '후아이쾅',
    'Khlong San': '클롱산', Ratchathewi: '랏차테위', 'Bangkok Yai': '방콕야이', 'Phaya Thai': '파야타이',
  },
};

/**
 * Common short country names for the globe. Natural Earth's NAME_KO uses formal
 * official names (중화인민공화국, 조선민주주의인민공화국…) — maps use the everyday
 * short form. Keyed by ISO A2; countries not listed keep their NAME_KO.
 */
export const COUNTRY_KO_SHORT: Record<string, string> = {
  KR: '한국', KP: '북한', CN: '중국', TW: '대만', US: '미국', GB: '영국',
  RU: '러시아', DE: '독일', FR: '프랑스', ES: '스페인', AE: '아랍에미리트',
  CZ: '체코', DO: '도미니카', LA: '라오스', BN: '브루나이', VA: '바티칸',
  MK: '북마케도니아', BA: '보스니아', CD: '콩고민주공화국', CG: '콩고',
  CF: '중앙아프리카공화국', TZ: '탄자니아', VE: '베네수엘라', BO: '볼리비아',
  IR: '이란', SY: '시리아', EG: '이집트', ZA: '남아공', SA: '사우디아라비아',
};

export function countryNameKo(iso: string, nameKoFromData: string): string {
  return COUNTRY_KO_SHORT[iso] ?? nameKoFromData;
}

export function regionNameKo(regionId: string, fallbackEnglish: string): string {
  return REGION_KO[regionId] ?? fallbackEnglish;
}

export function cityNameKo(country: CountryCode, englishName: string): string {
  return CITY_KO[country]?.[englishName] ?? englishName;
}
