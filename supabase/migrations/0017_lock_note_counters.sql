-- 여행 공유의 신뢰를 지키는 컬럼 권한 잠금 (출시 전 필수).
--
-- 문제: anon 키는 앱에 들어 있어 공개다. 지금은 클라이언트가 city_notes의
-- 아무 컬럼이나 직접 쓸 수 있어서, API를 직접 호출하면
--   · like_count = 99999      → 가짜 좋아요, 추천순 조작
--   · created_at = 미래 날짜   → 최신순 영구 1위
--   · is_visible = true       → 신고로 자동 숨김된 내 글 되살리기
-- 가 전부 가능하다. 추천 보드의 신뢰가 무너진다.
--
-- 해법: 이 컬럼들은 "시스템이 정하는 값"이므로 클라이언트에게서 쓰기 권한을 뺏고,
-- 사용자가 실제로 저작하는 컬럼만 돌려준다.
--   · like_count → apply_note_like() 트리거만 변경 (SECURITY DEFINER = 소유자 권한
--     으로 실행되므로 이 회수의 영향을 받지 않는다. 좋아요는 계속 정상 동작)
--   · is_visible → apply_note_report() 트리거만 변경
--   · created_at / id → DB 기본값
--
-- 주의: Postgres는 테이블 레벨 INSERT/UPDATE 권한이 있으면 모든 컬럼을 허용하므로,
-- 컬럼 단위 제한을 걸려면 테이블 권한을 먼저 회수하고 허용 컬럼만 다시 부여해야 한다.
--
-- ⚠️ 적용 후에는 scripts/seed-notes.js 가 like_count/created_at 을 직접 넣지
-- 못한다(스크립트는 권한 오류를 감지해 그 컬럼들 없이 재시도한다). 더미 데이터의
-- 좋아요·날짜를 다시 손보려면 이 마이그레이션 이전에 해야 한다.

-- 1) 테이블 레벨 쓰기 권한 회수
revoke insert, update on public.city_notes from anon, authenticated;

-- 2) 사용자가 실제로 저작하는 컬럼만 돌려준다.
--    (anon = 세션 없는 요청 → 쓰기 자체가 필요 없다. 아무 것도 부여하지 않는다.)
grant insert (user_id, country, region_id, city_name, body, photo_paths)
  on public.city_notes to authenticated;

grant update (body, photo_paths, updated_at)
  on public.city_notes to authenticated;

-- RLS(0007/0014)는 그대로 유효하다: 최근 7일 내 체크인한 본인만 작성,
-- 익명 세션은 쓰기 불가. 이 마이그레이션은 "무엇을" 쓸 수 있는지를 좁힌다.
