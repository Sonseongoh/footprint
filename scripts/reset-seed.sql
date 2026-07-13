-- 시드 데이터 초기화 — Supabase SQL Editor에서 실행한 뒤 `node scripts/seed-notes.js`.
--
-- 지우는 것 (둘 다 더미):
--   1) 익명 계정이 만든 것  — 옛 시드(seed-busan-bulk.js 등). 게스트 쓰기가 막힌
--      지금은 앱에서 지울 수도 없다(작성자만 삭제 가능한데 로그인 불가).
--   2) 시드 계정(@seed.footprint.local)이 만든 것 — 여행자 구성(나라별 조합)을
--      새로 배정하므로, 옛 배정으로 만든 체크인·글이 남으면 서로 모순된다.
--
-- 건드리지 않는 것: 내 실계정(이메일·구글)으로 만든 체크인·여행 공유.

-- 0) 지우기 전 현황
select
  (select count(*) from public.city_notes n join auth.users u on u.id = n.user_id
     where u.is_anonymous or u.email like '%@seed.footprint.local')            as 더미_여행공유,
  (select count(*) from public.visit_events e join auth.users u on u.id = e.user_id
     where u.is_anonymous or u.email like '%@seed.footprint.local')            as 더미_체크인,
  (select count(*) from auth.users
     where is_anonymous or email like '%@seed.footprint.local')                as 더미_계정;

-- 1) 더미 여행 공유 삭제 (좋아요·신고는 cascade)
delete from public.city_notes n
using auth.users u
where u.id = n.user_id
  and (u.is_anonymous or u.email like '%@seed.footprint.local');

-- 2) 더미 체크인 + 집계 삭제
delete from public.visit_events e
using auth.users u
where u.id = e.user_id
  and (u.is_anonymous or u.email like '%@seed.footprint.local');

delete from public.visits v
using auth.users u
where u.id = v.user_id
  and (u.is_anonymous or u.email like '%@seed.footprint.local');

delete from public.visits_city vc
using auth.users u
where u.id = vc.user_id
  and (u.is_anonymous or u.email like '%@seed.footprint.local');

-- 3) 쓸모없는 익명 계정 삭제 (앱은 필요하면 새로 만든다).
--    시드 계정(@seed.footprint.local)은 남겨둔다 — 다시 심을 때 재사용하면
--    가입 rate limit을 아끼고 닉네임도 그대로 유지된다.
delete from auth.users where is_anonymous;

-- 4) 결과 확인 — 남은 여행 공유는 내 실계정 글뿐이어야 한다
select region_id, count(*) as 글수
from public.city_notes
where is_visible
group by region_id
order by 글수 desc;
