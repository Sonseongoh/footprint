# TODOS — Footprint

이번 /plan-eng-review (2026-06-02)에서 v1 스코프 밖으로 보류한 항목들. 기록만 해둔 것이며 실행 여부는 추후 결정.

## 보안 (출시 전 필수) — Security, MUST before launch

### [ ] city_notes.like_count 클라이언트 쓰기 차단 (가짜 좋아요 방지)
- **What:** `like_count`(및 향후 비정규화 카운터)를 클라이언트가 직접 INSERT/UPDATE 못 하게 막기. 좋아요 트리거(`apply_note_like`)만 변경 가능하게.
- **Why:** anon 키는 앱에 들어있어 공개됨 → 누구나 API 직접 호출로 `like_count: 99999` 주입 가능 → 가짜 좋아요·**추천순 정렬 조작**. 추천 보드의 신뢰가 무너짐. (앱 자체는 like_count를 직접 안 쓰지만 DB가 강제하지 않음.)
- **How:** 마이그레이션(≈0011) 컬럼 단위 revoke — SECURITY DEFINER 트리거(테이블 소유자 권한)만 통과:
  ```sql
  revoke insert (like_count), update (like_count)
    on public.city_notes from anon, authenticated;
  ```
- **주의:** 적용하면 `scripts/seed-busan-bulk.js` 등 like_count를 직접 넣는 시드가 깨짐 → **더미 데이터는 막기 전에 다 만들 것.**
- **상태:** 2026-06-22 보류(시드 더 만들 수 있게). 준비되면 적용.

## 출시 설정 — 직접 해야 하는 외부 작업

### [x] 마이그레이션 0012·0013·0014 적용 (완료 2026-07-02)
- 0012 신고 + 자동 숨김 / 0013 계정 삭제 RPC / 0014 게스트 쓰기 차단 — 전부 적용 확인됨.

### [x] 구글 로그인 설정 (완료 2026-07-02)
- Google Cloud OAuth 클라이언트(Web) + Supabase Google provider + Redirect URL `footprint://auth-callback` 설정 완료, 실기기 로그인 확인.
- 현재 동의 화면은 **테스트 모드** — 등록된 테스트 사용자만 로그인 가능. **스토어 출시 전 "프로덕션 게시" 필요** (구글 검수 있을 수 있음).

### [ ] 개인정보처리방침 URL (스토어 등록 필수) ★
- **What:** 위치·사진·계정(이메일)을 수집하므로 Play 스토어 등록에 개인정보처리방침 공개 URL이 필수. 계정 삭제 안내도 포함해야 함.
- **How:** 정적 페이지 한 장이면 됨 — 공유 웹(footprint.expo.app)에 `/privacy` 라우트로 넣거나 GitHub Pages. 수집 항목/용도/보관/삭제 방법 명시.

### [ ] PKCE code challenge가 plain으로 동작 (보안 강화)
- **What:** RN에 WebCrypto가 없어 Supabase PKCE가 S256 대신 plain 사용 중 (Metro 경고 확인됨). `expo-standard-web-crypto` 폴리필로 S256 활성화.
- **Why:** plain도 TLS 위에선 동작하지만 S256이 표준 권장. 출시 전 정리.

### [ ] 기타 출시 정리
- iOS `bundleIdentifier` 미설정 (Android 먼저면 보류 가능)
- LICENSE가 Expo 템플릿(650 Industries) 명의 그대로 — 본인 명의로 교체 또는 제거
- expo 56.0.6 → 56.0.13 등 패키지 15개 업데이트 (`npx expo install --check`)
- README 스크린샷 (앱 완성 후)

## UX·스토어 감사 잔여 항목 (2026-07-03 병렬 감사, 48건 검증됨 — 1차 수정분 제외)

### 출시 전 필수
- [ ] **테스트 좌표 버튼 `__DEV__` 가드** (index.tsx TEST_POINTS) — 테스트 끝나면 감싸기. 안 하면 프로덕션에서 누구나 가짜 체크인 가능 = 신뢰 모델 붕괴. ★사용자 결정: 테스트 기간엔 유지
- [x] **차단(block) 기능** — 완료 2026-07-06 (0015 user_blocks + ⋯메뉴 차단 + /blocked 관리 화면)
- [x] **웹 계정 삭제 경로** — 완료 2026-07-06. privacy §3에 앱 내 삭제 + 이메일 삭제 요청(7일 내 처리) 명시, 프로덕션 배포됨. Play 콘솔 데이터 삭제 URL로 `https://footprint.expo.app/privacy` 제출
- [ ] 구글 OAuth 동의화면 **프로덕션 게시** (지금은 테스트 사용자만 로그인 가능)
- [ ] Play 콘솔 **데이터 안전 폼** (위치·사진·이메일, 삭제 제공 체크 — privacy 페이지와 일치시킬 것)

### Major (출시 전 권장)
- [ ] 7일 지나면 내 여행 공유 **삭제 불가** — DB는 상시 허용인데 UI 휴지통이 canWrite 분기 안에 있음 ([regionId].tsx:451)
- [ ] 체크인 사진 여러 장 중 **첫 장만 열람 가능** — PhotoViewer에 여러 장/스와이프 필요
- [ ] 안드로이드 **구글 로그인 실패가 무음** — completeOAuthFromUrl 에러가 catch로 삼켜짐 (_layout, auth-callback)
- [ ] 첫 실행 탭이 체크인(로그인 벽) — **지구본을 initialRouteName으로**
- [ ] 지구본→지도 같은 나라 재탭 시 **지도가 안 바뀜** (explore stale param)
- [ ] **라이트 모드 기기에서 흰 탭바** 부조화 — 다크 고정(userInterfaceStyle: dark + 탭바 Palette)
- [ ] 오프라인이면 기록 탭이 "기록 없음" 표시 — 마지막 조회 캐시 또는 오프라인 안내 구분
- [ ] 계정 전환 후 기록 **국가 필터 스테일** → 기록 있는데 "없음" 함정

### Minor (모아서 처리)
- 사진·위치 권한 거부 시 무반응/설정 열기 버튼 없음 · 게스트 닉네임 카드(로그인 시 증발) · 영어 에러 원문 노출(Email not confirmed 등) · 구글 로그인 후 무조건 /me 이동 · 정렬↔스크롤 레이스 · 네트워크 오류가 "공유 0"으로 위장 · "메모는 1~500자" 용어 불일치·"백엔드 연결" 문구 · 공유 삭제 시 사진 잔존 · 기록 200건 캡(통계 왜곡) · 나 탭 로드 실패 무한 스피너 · 숨김 처리된 내 글 표시 불일치 · 동기화 대기 사진 캐시 소실 시 영구 대기 · JP/TH 카드 도시명↔현 화면 혼동

## 일반 (추가)

### [ ] 이메일 가입의 익명 승격 경로 단순화
- **What:** `signUpWithEmail`이 게스트면 `updateUser`로 익명 계정을 승격시키는데(기록 이어받기), 게스트=구경꾼 전환 후엔 이어받을 데이터가 없음. 구글처럼 평범한 signUp으로 단순화하고 "기존 기록도 이어집니다" 문구 제거.
- **Why:** 죽은 복잡도 + 이메일/구글 동작 비일관. 단, "게스트 체험 모드"를 되살릴 거면 유지 가치 있음 — 그래서 보류로 기록.

### [ ] 익명 계정 누적 정리
- **What:** 앱 실행/로그아웃마다 생성되는 익명 auth 유저가 서버에 쌓임. 게스트=구경꾼 전환(0014) 이후 익명 세션의 실질 용도가 없어짐 — 장기적으로 익명 세션 생성 자체를 제거하거나, 오래된 익명 유저를 주기 삭제.
- **Why:** auth.users 오염. 당장 해롭진 않음(쓰기 차단됨) — 출시 전 필수는 아님.

## 우선 (Priority)

### [ ] EXIF 사후 복구
- **What:** 갤러리 사진의 EXIF GPS+촬영시각이 해당 도시 범위 내면 미기록 도시를 사후 인정.
- **Why:** 여행 중 깜빡한 도시를 메꿔 수집 만족도를 올림. 설계의 '증거 기반 사후 복구' 원칙 실현.
- **Pros:** 여행 현실(깜빡함) 커버. 초기 만족도 ↑.
- **Cons:** EXIF 파서, iOS 카메라 GPS 미포함 예외, 검증 UX 추가.
- **Context:** v1 스키마에 `visit_events.source = 'recovered'` 값이 이미 열려 있어 스키마 변경 불필요. `expo-image-picker`의 `exif: true`로 GPS 추출(라이브러리 선택 사진만 신뢰). 같은 `geo.verifyCity` 재사용.
- **Depends on:** v1 코어 루프 + geo.ts 완료.

### [ ] 재참여 푸시 알림
- **What:** 빈 도시/다음 여행 유도 푸시.
- **Why:** "빈 도시가 보임 → 더 채우고 싶어짐" 수집 루프를 앱 밖에서도 자극.
- **Pros:** 재방문·리텐션 동력.
- **Cons:** dev build 전환, 푸시 권한·서버 스케줄링 필요.
- **Context:** expo-notifications + Supabase Edge Function 스케줄. v1은 Expo Go라 이 시점에 dev build 전환됨.
- **Depends on:** v1 출시 후 리텐션 데이터.

## 일반

### [ ] 행정경계 polygon 판정 (v2)
- **What:** 반경 판정 → point-in-polygon 정밀 경계로 업그레이드.
- **Why:** 도시 경계 모호함(반경 겹침/공백) 해소.
- **Cons:** 경계 GeoJSON 데이터·연산·용량 증가.
- **Context:** v1은 중심좌표+`radius_km`. 데이터 모델은 city별 polygon 컬럼 추가로 확장 가능.

### [ ] 지구본 Skia 업그레이드
- **What:** v1 SVG 지구본 → Skia 게임풍(글로우·블러·60fps).
- **Why:** 첫 화면 wow 강화 → 재방문 유인.
- **Cons:** Expo Go 포기, dev build 전환.
- **Context:** d3-geo 투영 로직은 그대로 두고 렌더 레이어만 SVG→Skia 교체.
