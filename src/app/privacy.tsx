/**
 * 개인정보처리방침 — store-required public privacy policy.
 * Served on the web build (footprint.expo.app/privacy — the URL app stores
 * require) and reachable in-app from the account screen. Content mirrors what
 * the app ACTUALLY collects; update this page when collection changes.
 */
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Palette, Space } from '@/constants/footprint-theme';

const EFFECTIVE_DATE = '2026-07-02';
const CONTACT_EMAIL = 'thstjddh8891@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.liRow}>
      <Text style={styles.liDot}>·</Text>
      <Text style={styles.liText}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, title: '개인정보처리방침' }} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {router.canGoBack() && (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.back}>‹ 뒤로</Text>
            </Pressable>
          )}

          <Text style={styles.h1}>footprint 개인정보처리방침</Text>
          <Text style={styles.meta}>시행일 {EFFECTIVE_DATE}</Text>

          <P>
            footprint(이하 "앱")는 여행 체크인 기록 서비스를 제공하기 위해 아래와 같이 최소한의
            개인정보를 수집·이용합니다.
          </P>

          <Section title="1. 수집하는 정보">
            <Li>계정 정보 — 이메일 주소(이메일 가입 또는 Google 로그인 시). Google 로그인 시 Google 계정의 이메일만 제공받습니다.</Li>
            <Li>프로필 — 닉네임(선택 입력, 여행 공유 작성자로 표시).</Li>
            <Li>위치 정보 — 체크인 버튼을 누른 순간의 GPS 좌표(위도·경도·정확도). 체크인 시에만 수집하며, 백그라운드 위치 추적은 하지 않습니다.</Li>
            <Li>사진 — 사용자가 직접 첨부한 사진. 체크인 사진은 본인만 볼 수 있는 비공개 저장소에, 여행 공유에 첨부한 사진은 공개 저장소에 저장됩니다.</Li>
            <Li>콘텐츠 — 체크인 메모(비공개), 여행 공유 글(공개), 좋아요·신고 내역.</Li>
          </Section>

          <Section title="2. 이용 목적">
            <Li>방문 도시 인증과 지도 채움 등 서비스 핵심 기능 제공</Li>
            <Li>계정 식별과 기기 간 기록 동기화</Li>
            <Li>여행 공유·좋아요 등 커뮤니티 기능 제공, 신고 처리를 통한 커뮤니티 보호</Li>
          </Section>

          <Section title="3. 보관 및 파기 (계정·데이터 삭제)">
            <P>
              수집한 정보는 서비스 제공 기간 동안 보관됩니다. 삭제를 원하시면 아래 두 가지 방법
              중 하나로 요청할 수 있으며, 두 경우 모두 계정과 모든 기록(체크인, 위치, 사진, 여행
              공유, 좋아요, 신고)이 영구 삭제되고 복구할 수 없습니다.
            </P>
            <Li>앱에서: 나 탭 → 설정(계정) → "계정 삭제" — 즉시 삭제됩니다.</Li>
            <Li>
              앱 없이(웹): 앱을 이미 삭제했거나 접근할 수 없는 경우, 가입한 이메일 주소로
              {' '}{CONTACT_EMAIL} 에 "계정 삭제 요청"을 보내주세요. 본인 확인 후 7일 이내에
              계정과 모든 데이터를 영구 삭제합니다.
            </Li>
          </Section>

          <Section title="4. 제3자 제공 및 처리 위탁">
            <P>
              개인정보를 제3자에게 판매하거나 제공하지 않습니다. 데이터 저장·인증을 위해 클라우드
              인프라(Supabase)를 이용하며, Google 로그인 이용 시 Google의 인증 절차를 거칩니다.
            </P>
          </Section>

          <Section title="5. 공개 범위">
            <Li>여행 공유 글·첨부 사진·닉네임 — 다른 사용자에게 공개됩니다.</Li>
            <Li>공유 링크 페이지 — 지역별 채움 현황과 방문 횟수만 공개되며, 정확한 위치 좌표·메모·체크인 사진은 공개되지 않습니다.</Li>
            <Li>체크인 기록·메모·체크인 사진 — 본인만 볼 수 있습니다.</Li>
          </Section>

          <Section title="6. 이용자의 권리">
            <P>
              이용자는 언제든지 앱 내에서 닉네임을 수정하거나, 본인이 작성한 여행 공유를
              수정·삭제하거나, 계정 전체를 삭제할 수 있습니다. 기타 개인정보 관련 요청은 아래
              연락처로 문의해 주세요.
            </P>
          </Section>

          <Section title="7. 문의">
            <P>{CONTACT_EMAIL}</P>
          </Section>

          <Text style={styles.footer}>
            본 방침이 변경되는 경우 이 페이지를 통해 고지합니다.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  scroll: { padding: Space.lg, paddingBottom: Space.xxl, gap: Space.sm, maxWidth: 720, width: '100%', alignSelf: 'center' },
  back: { color: Palette.muted, fontSize: 16, fontWeight: '600', marginBottom: Space.sm },
  h1: { color: Palette.ink, fontSize: 24, fontWeight: '800' },
  meta: { color: Palette.muted, fontSize: 13, marginBottom: Space.sm },
  section: { gap: 6, marginTop: Space.md },
  h2: { color: Palette.gold, fontSize: 16, fontWeight: '800' },
  p: { color: Palette.ink, fontSize: 14, lineHeight: 22 },
  liRow: { flexDirection: 'row', gap: 8, paddingRight: Space.sm },
  liDot: { color: Palette.muted, fontSize: 14, lineHeight: 22 },
  liText: { color: Palette.ink, fontSize: 14, lineHeight: 22, flex: 1 },
  footer: { color: Palette.muted, fontSize: 13, marginTop: Space.xl },
});
