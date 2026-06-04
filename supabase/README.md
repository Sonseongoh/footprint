# Supabase 설정 (수동 — MCP 커넥터 불필요)

앱은 런타임에 `@supabase/supabase-js`만 쓴다. 백엔드는 **본인 Supabase 계정**에서
대시보드로 직접 만들면 된다. Claude/MCP 커넥터는 필요 없다.

## 1. 프로젝트 생성
1. https://supabase.com 에 **본인 계정**으로 로그인
2. New project → 이름 `footprint`, 리전 `Northeast Asia (Seoul) ap-northeast-2` 권장
3. 생성 후 Project Settings → API 에서 다음을 복사:
   - **Project URL**
   - **anon / publishable key**

## 2. 스키마 적용
대시보드 좌측 **SQL Editor** → New query → [`migrations/0001_init.sql`](migrations/0001_init.sql)
전체 내용 붙여넣고 Run. 그다음 같은 방식으로 [`migrations/0002_harden_trigger_functions.sql`](migrations/0002_harden_trigger_functions.sql) 실행.

> 또는 Supabase CLI 사용 시: `supabase link --project-ref <ref>` 후 `supabase db push`.

## 3. 앱에 연결
프로젝트 루트의 `.env.example` 를 `.env` 로 복사하고 값을 채운다:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

`.env` 는 git에 커밋하지 않는다(`.gitignore` 처리).

## 4. 익명 인증 활성화
Authentication → Sign In / Providers → **Anonymous sign-ins** 를 켠다
(deferred auth: 익명으로 시작 → 나중에 계정 연결).

## 5. 사진 스토리지 (v1 사진 업로드 단계에서)
Storage → New bucket `photos` (private). RLS로 본인 폴더만 접근하게 정책 추가
(사진 업로드 서브태스크에서 마이그레이션으로 추가 예정).

## 보안 점검
스키마 적용 후 대시보드 Advisors(또는 `supabase db lint`)로 RLS/보안 경고를 확인한다.
`0001_init.sql` 는 트리거 함수의 RPC 노출 경고를 `0002` 에서 이미 닫아둔다.
