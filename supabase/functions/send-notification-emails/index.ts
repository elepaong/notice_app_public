// Supabase Edge Function：通知メールの送信（pg_cron から1分ごとに呼ばれる）
//
// 必要なシークレット（supabase secrets set ...）
//   RESEND_API_KEY      … Resend の API キー
//   MAIL_FROM           … 送信元（例：クレーム管理システム <claims@example.com>）
//   APP_URL             … アプリの URL（例：https://claims.example.com）
//   EMAIL_CRON_SECRET   … 定期実行からの呼び出しを確認する合言葉（Vault と同じ値）
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で設定する

import { createClient } from "npm:@supabase/supabase-js@2";
import { processBatch } from "../_shared/email-worker.ts";
import type { OutboxItem } from "../_shared/notification-email.ts";
import { createResendSender } from "../_shared/resend.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`環境変数 ${name} が設定されていません`);
  return v;
}

Deno.serve(async (req) => {
  // 定期実行（pg_cron）以外からは呼べないようにする
  const secret = Deno.env.get("EMAIL_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const summary = await processBatch({
      claimBatch: async (limit) => {
        const { data, error } = await db.rpc("claim_email_batch", { p_limit: limit });
        if (error) throw new Error(`claim_email_batch: ${error.message}`);
        return (data ?? []) as OutboxItem[];
      },
      finish: async (id, result) => {
        const { error } = await db.rpc("finish_email", {
          p_id: id,
          p_ok: result.ok,
          p_provider_id: result.ok ? result.id : null,
          p_error: result.ok ? null : result.error,
          p_retryable: result.ok ? true : result.retryable,
        });
        if (error) console.error(`finish_email #${id}: ${error.message}`);
      },
      send: createResendSender(env("RESEND_API_KEY")),
      from: env("MAIL_FROM"),
      appUrl: env("APP_URL"),
      intervalMs: 600, // Resend の既定レート制限（毎秒2通）に合わせる
    });
    if (summary.failed > 0) console.error(JSON.stringify(summary));
    return Response.json(summary);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
