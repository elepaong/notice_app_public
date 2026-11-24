-- 通知メール：通知の届け先ごとに送信キュー（email_outbox）を作り、Edge Function が送信する
--
--   通知の作成（トリガー）→ email_outbox に pending で追加
--   → 1分ごとの定期実行で Edge Function「send-notification-emails」が呼ばれる
--   → claim_email_batch() で取り出して送信 → finish_email() で結果を記録（失敗は再試行）

-- 社員ごとにメール通知を止められるように（既定はオン）
alter table public.profiles add column email_notifications boolean not null default true;

create type public.email_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

create table public.email_outbox (
  id              bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  to_email        text,
  status          public.email_status not null default 'pending',
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  provider_id     text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (notification_id, user_id)
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status in ('pending', 'sending');

alter table public.email_outbox enable row level security;
-- 送信状況の画面で表示するため、ログイン済みの社員は読める（書き込みはサーバーのみ）
create policy "read" on public.email_outbox for select to authenticated using (true);
revoke insert, update, delete on public.email_outbox from anon, authenticated;
revoke all on public.email_outbox from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.email_outbox;
  end if;
end;
$$;

-- ───────── 通知の届け先が決まったらキューに追加 ─────────
create function public.enqueue_notification_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into email_outbox (notification_id, user_id, to_email, status, last_error)
  select new.notification_id, p.id, p.email,
    case when p.email is null or not p.email_notifications then 'skipped'::email_status else 'pending' end,
    case when p.email is null then 'メールアドレスなし' when not p.email_notifications then 'メール通知オフ' end
  from profiles p where p.id = new.user_id
  on conflict (notification_id, user_id) do nothing;
  return null;
end;
$$;
create trigger notification_recipients_enqueue_email after insert on public.notification_recipients
for each row execute function public.enqueue_notification_email();

-- ───────── 送信対象の取り出し（Edge Function から service_role で呼ぶ） ─────────
-- 送信中のまま10分以上止まっているもの（途中で落ちた場合）も取り直す
create function public.claim_email_batch(p_limit int default 50) returns setof jsonb
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select o.id from email_outbox o
    where (o.status = 'pending' and o.next_attempt_at <= now())
       or (o.status = 'sending' and o.locked_at < now() - interval '10 minutes')
    order by o.id
    limit p_limit
    for update skip locked
  ),
  locked as (
    update email_outbox o
    set status = 'sending', attempts = o.attempts + 1, locked_at = now()
    from picked where o.id = picked.id
    returning o.*
  )
  select jsonb_build_object(
    'id', l.id,
    'to', l.to_email,
    'attempts', l.attempts,
    'recipientName', rp.name,
    'isAssignee', c.assignee_id = l.user_id,
    'event', n.event,
    'actorName', ap.name,
    'notifiedAt', n.created_at,
    'message', (
      select a.message from claim_approvals a
      where a.claim_id = c.id and a.created_at <= n.created_at
        and a.action = case n.event
          when 'approval_requested' then 'requested'::approval_action
          when 'approved' then 'approved'::approval_action
          when 'returned' then 'returned'::approval_action
        end
      order by a.created_at desc limit 1
    ),
    'claim', jsonb_build_object(
      'id', c.id, 'category', c.category, 'level', c.level, 'status', c.status,
      'title', c.title, 'content', c.content, 'site', c.site, 'amount', c.amount,
      'customer', c.customer, 'assigneeName', asg.name, 'reporterName', rep.name
    )
  )
  from locked l
  join notifications n on n.id = l.notification_id
  join claims c on c.id = n.claim_id
  join profiles rp on rp.id = l.user_id
  join profiles ap on ap.id = n.actor_id
  join profiles rep on rep.id = c.reporter_id
  left join profiles asg on asg.id = c.assignee_id
  order by l.id;
end;
$$;

-- ───────── 送信結果の記録 ─────────
-- 失敗：再試行できるものは 1, 4, 9, 16 分後に再送（最大5回）。それ以外は failed
create function public.finish_email(p_id bigint, p_ok boolean, p_provider_id text default null,
                                    p_error text default null, p_retryable boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update email_outbox o set
    status = case
      when p_ok then 'sent'::email_status
      when p_retryable and o.attempts < 5 then 'pending'::email_status
      else 'failed'::email_status
    end,
    sent_at = case when p_ok then now() end,
    provider_id = coalesce(p_provider_id, o.provider_id),
    last_error = case when p_ok then null else left(p_error, 1000) end,
    next_attempt_at = case when not p_ok then now() + make_interval(mins => o.attempts * o.attempts) else o.next_attempt_at end,
    locked_at = null
  where o.id = p_id and o.status = 'sending';
end;
$$;

revoke execute on function public.enqueue_notification_email() from public, anon, authenticated;
revoke execute on function public.claim_email_batch(int) from public, anon, authenticated;
revoke execute on function public.finish_email(bigint, boolean, text, text, boolean) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_email_batch(int) to service_role;
    grant execute on function public.finish_email(bigint, boolean, text, text, boolean) to service_role;
  end if;
end;
$$;
