import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 環境変数が設定されていれば Supabase モード、なければデモモード */
export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error("Supabase の環境変数が設定されていません");
  client ??= createBrowserClient(url!, key!);
  return client;
}

export const PHOTO_BUCKET = "claim-photos";

/** ログインを許可する会社の Google Workspace ドメイン（例：example.com） */
export const GOOGLE_WORKSPACE_DOMAIN =
  process.env.NEXT_PUBLIC_GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase() || null;

/** メールアドレスが会社のドメインか（ドメイン未設定なら判定しない。最終的な制限は DB 側） */
export function isCompanyEmail(email: string | null | undefined): boolean {
  if (!GOOGLE_WORKSPACE_DOMAIN) return true;
  return (email ?? "").toLowerCase().endsWith(`@${GOOGLE_WORKSPACE_DOMAIN}`);
}
