-- 도시 폴리곤 통일(2026-07-14/15) 후 구모델 데이터 정리.
-- 스키마 변경 없음 — region_id의 의미만 admin-1 → 도시 폴리곤 id로 바뀌었다.
-- JP/TH의 구모델 키(JP-13, TH-50 …)로 남은 행을 지운다. 실사용자 0명(더미 시드
-- + 개발 테스트 계정뿐)인 지금만 안전한 방식이다. KR 행은 이미 krc-* 라 무관.
--
-- 실행: Supabase SQL Editor에 붙여넣고 Run (한 번만).
-- 이후 `node scripts/seed-notes.js` 재실행으로 JP/TH 더미 글을 새 도시 게시판에 심는다.

begin;

-- 구모델 여행 공유와 그에 달린 좋아요/신고 (FK보다 먼저 지움)
delete from public.city_note_likes
 where note_id in (select id from public.city_notes where region_id ~ '^(JP|TH)-');
delete from public.city_note_reports
 where note_id in (select id from public.city_notes where region_id ~ '^(JP|TH)-');
delete from public.city_notes where region_id ~ '^(JP|TH)-';

-- 구모델 체크인 이벤트와 채움 집계 (개발 테스트 체크인 포함)
delete from public.visit_events where region_id ~ '^(JP|TH)-';
delete from public.visits       where region_id ~ '^(JP|TH)-';

-- 도시 포인트 모델과 함께 폐기된 테이블 — 더는 아무 코드도 읽지 않는다
truncate public.visits_city;

commit;

-- 확인용: 남은 구모델 키가 0이어야 함
-- select count(*) from public.visits where region_id ~ '^(JP|TH)-';
