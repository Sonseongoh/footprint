# footprint

**여행을 수집하다.**

직접 가서 GPS로 인증한 도시만 지도에 금색으로 채워지는 여행 수집 앱.
한 나라를 얼마나 깊게 여행했는지 — 도시 단위로 모은다. (v1: 한국 · 일본 · 태국)

## 컨셉

```
체크인 → 지도가 채워짐 → 빈 도시가 보임 → 더 채우고 싶음 → 다음 여행
```

- **가본 곳만 기록된다.** 수동 추가 없음. 현장 GPS 인증(행정구역 polygon 판정)만 발자국이 된다.
- **수집의 단위는 도시.** 한국은 시 단위, 일본은 현, 태국은 주 단위로 지도가 채워진다.
- **재방문은 누적된다.** 같은 도시를 다시 가면 방문 횟수가 쌓인다.

## 주요 기능

| 기능         | 설명                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 🌍 지구본    | 지구본에서 나라를 골라 내 지도를 펼친다                                                  |
| 📍 체크인    | 현장 GPS 인증 + 메모(나만 보기) + 사진(최대 5장)                                         |
| 🗺️ 채움 지도 | 방문한 행정구역이 금색으로 채워지는 나라별 choropleth                                    |
| 🧾 기록      | 체크인 타임라인, 나라별 필터, 사진 썸네일                                                |
| 🌏 여행 공유 | 체크인한 사람만(7일 이내) 그 도시에 남길 수 있는 공개 추천 — 좋아요·정렬·무한스크롤·신고 |
| 👣 내 발자국 | 수집 통계(나라/채운 도시/공유), 나라별 진행도, 내 공유 모음                              |
| 🔗 공유 링크 | 나라별 채움 지도를 웹 링크로 공유 (위치·메모·사진은 비공개)                              |
| 👤 계정      | 이메일/구글 로그인, 닉네임, 계정 삭제(데이터 영구 삭제)                                  |

## 기술 스택

- **앱**: Expo SDK 56 · React Native 0.85 (New Architecture) · expo-router · Reanimated 4 · react-native-svg + d3-geo
- **백엔드**: Supabase — Auth(이메일/Google OAuth PKCE) · Postgres + RLS · Storage(개인 사진은 private, 공유 사진은 public 버킷)
- **로컬 우선**: expo-sqlite — 체크인은 로컬 큐에 먼저 저장되고(오프라인 안전) 온라인일 때 서버로 동기화. 지도/지구본/통계는 로컬 투영에서 즉시 렌더링

```
체크인 ─▶ SQLite 큐 + 로컬 투영(지도 즉시 반영)
              │ flushQueue (온라인 시)
              ▼
     visit_events (개인, RLS)
              ▼ DB 트리거
     visits 집계 ─▶ 공유 페이지(채움+횟수만 공개)
```

## 시작하기

```bash
npm install
cp .env.example .env   # Supabase URL/키 입력
npx expo start
```

- **dev build 필요** — 네이티브 모듈(expo-dev-client, secure-store, sqlite 등)을 쓰므로 Expo Go로는 동작하지 않는다. `npx expo run:android` 또는 EAS build로 개발 클라이언트를 설치한 뒤 Metro에 연결한다.
- **DB 마이그레이션** — `supabase/migrations/`의 SQL을 순서대로 Supabase 대시보드 SQL Editor에서 실행한다.
- **구글 로그인** — Supabase Auth에 Google provider 설정 + Redirect URL `footprint://auth-callback` 등록이 필요하다. (자세한 값은 `TODOS.md`의 출시 설정 참고)

## 테스트

```bash
npm test        # jest — 지역 데이터 무결성 + 지오 판정
npx tsc --noEmit
```

## 프로젝트 구조

```
src/
├── app/            # expo-router 화면 (탭: 지구본·체크인·기록·지도·나)
├── features/       # 지구본(CountryGlobe) · 채움 지도(CountryFillMap)
├── lib/            # 체크인·동기화 큐·로컬 투영·인증·여행 공유·통계
├── data/           # 번들된 행정구역 GeoJSON + 도시 포인트 + 한글 명칭
└── types/          # 도메인 타입
supabase/
└── migrations/     # DB 스키마 (수동 적용)
```

## 설계 문서

- **[docs/PORTFOLIO.md](docs/PORTFOLIO.md) — 문제 정의와 결정의 기록** (왜 이렇게 만들었는지, 어떤 가설이 틀렸는지, 뭐에 막혔고 뭐가 남았는지)
- [DESIGN.md](DESIGN.md) — 제품 정의, 신뢰 모델, v1 아키텍처 결정
- [CONTEXT.md](CONTEXT.md) — 도메인 용어집
- [TODOS.md](TODOS.md) — 보류 항목과 출시 전 필수 작업
