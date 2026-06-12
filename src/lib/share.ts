/**
 * Public share pages — "내 일본 지도 봐" links.
 *
 * One share page per (user, country): an unguessable slug in share_pages.
 * RLS exposes the page row and the user's region-level fill (visits) to anyone
 * while is_public — never notes/GPS/photos (visit_events stays owner-only).
 */
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import type { CountryCode } from '@/types/domain';

/** Where the public web build is served (EAS Hosting). */
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? '';

export function shareUrlFor(slug: string): string {
  return SHARE_BASE_URL ? `${SHARE_BASE_URL}/share/${slug}` : `share/${slug}`;
}

/** Returns the existing share slug for this country, or creates one. */
export async function ensureSharePage(country: CountryCode): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error('로그인(백엔드 연결)이 필요합니다');

  const { data: existing, error: selErr } = await supabase
    .from('share_pages')
    .select('slug')
    .eq('user_id', userId)
    .eq('country', country)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing?.slug) return existing.slug;

  // unguessable, url-safe slug (privacy gate is "knows the link")
  const slug = Crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { error: insErr } = await supabase
    .from('share_pages')
    .insert({ slug, user_id: userId, country, is_public: true });
  if (insErr) throw insErr;
  return slug;
}

export interface PublicShareData {
  country: CountryCode;
  /** regionIds with at least one visit, with counts */
  regions: Record<string, number>;
  totalVisits: number;
}

/** Anonymous read of a public share page (used by the /share/[slug] web route). */
export async function getPublicShare(slug: string): Promise<PublicShareData | null> {
  const { data: page, error: pageErr } = await supabase
    .from('share_pages')
    .select('user_id, country, is_public')
    .eq('slug', slug)
    .maybeSingle();
  if (pageErr || !page || !page.is_public) return null;

  const { data: visits, error: vErr } = await supabase
    .from('visits')
    .select('region_id, visit_count')
    .eq('user_id', page.user_id)
    .eq('country', page.country);
  if (vErr) return null;

  const regions: Record<string, number> = {};
  let total = 0;
  for (const v of visits ?? []) {
    regions[v.region_id] = v.visit_count;
    total += v.visit_count;
  }
  return { country: page.country as CountryCode, regions, totalVisits: total };
}
