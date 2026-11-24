-- 通知メールの定期送信（1分ごと）の設定
-- マイグレーションとは別に、Edge Function をデプロイしてから SQL Editor で1回だけ実行する。
-- 実行前に <...> の2か所を書き換えること。

-- 1) 必要な拡張機能
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) 呼び出し先と合言葉を Vault（暗号化して保存）に登録
--    project_url       … https://<Reference ID>.supabase.co
--    email_cron_secret … Edge Function のシークレット EMAIL_CRON_SECRET と同じ値
select vault.create_secret('https://<Reference ID>.supabase.co', 'project_url');
select vault.create_secret('<EMAIL_CRON_SECRET と同じ値>', 'email_cron_secret');

-- 3) 1分ごとに送信。送るものがないときは Edge Function を呼ばない
select cron.schedule(
  'send-notification-emails',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-notification-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from public.email_outbox
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'sending' and locked_at < now() - interval '10 minutes')
  );
  $$
);

-- 確認：select * from cron.job;
-- 実行履歴：select * from cron.job_run_details order by start_time desc limit 20;
-- 止める：select cron.unschedule('send-notification-emails');
