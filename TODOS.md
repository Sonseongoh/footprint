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
