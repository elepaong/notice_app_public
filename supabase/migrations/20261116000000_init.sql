-- クレーム管理システム：初期スキーマ
-- 承認レベル：Lv.1 = 支店管理者 / Lv.2 = 管理者 / Lv.3 = 社長（緊急度 低/中/高 と同じ）
-- src/lib/domain.ts と値を揃えること。

-- ───────── 型 ─────────
create type public.user_role as enum ('president', 'admin', 'branch_manager', 'staff');
create type public.claim_category as enum ('incident', 'vehicle', 'cash', 'equipment');
create type public.claim_status as enum ('received', 'in_progress', 'pending_approval', 'done', 'returned');
create type public.approval_action as enum ('requested', 'approved', 'returned');
create type public.notification_event as enum ('created', 'approval_requested', 'approved', 'returned');

-- ───────── マスタ ─────────
create table public.branches (
  id   smallint generated always as identity primary key,
  name text not null unique
);

create table public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  name      text not null,
  role      public.user_role not null default 'staff',
  branch_id smallint not null references public.branches (id)
);
create index on public.profiles (role, branch_id);

/** 役職の序列（大きいほど上位） */
create function public.role_rank(r public.user_role) returns int
language sql immutable as $$
  select case r when 'staff' then 0 when 'branch_manager' then 1 when 'admin' then 2 when 'president' then 3 end
$$;

-- レベルごとの承認者の役職（ここを変えれば承認ルートが変わる）
create table public.level_approver_roles (
  level smallint primary key check (level between 1 and 3),
  role  public.user_role not null
);
insert into public.level_approver_roles values (1, 'branch_manager'), (2, 'admin'), (3, 'president');

-- 種類ごとの緊急度（= 承認レベル）
create table public.category_levels (
  category public.claim_category primary key,
  level    smallint not null references public.level_approver_roles (level)
);
insert into public.category_levels values ('incident', 3), ('vehicle', 3), ('cash', 2), ('equipment', 1);

-- ───────── クレーム ─────────
create table public.claims (
  id                 text primary key,
  category           public.claim_category not null,
  level              smallint not null references public.level_approver_roles (level),
  status             public.claim_status not null default 'received',
  title              text not null,
  content            text not null,
  site_id            smallint not null references public.branches (id),
  responsible_person text not null default '',
  customer           text not null default '',
  assignee_id        uuid references public.profiles (id),
  reporter_id        uuid not null references public.profiles (id) default auth.uid(),
  amount             integer,
  occurred_on        date not null default current_date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index on public.claims (status);
create index on public.claims (created_at desc);
create index on public.claims (assignee_id);

create table public.claim_photos (
  id           bigint generated always as identity primary key,
  claim_id     text not null references public.claims (id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

create table public.claim_comments (
  id         bigint generated always as identity primary key,
  claim_id   text not null references public.claims (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) default auth.uid(),
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create table public.claim_approvals (
  id         bigint generated always as identity primary key,
  claim_id   text not null references public.claims (id) on delete cascade,
  action     public.approval_action not null,
  from_id    uuid not null references public.profiles (id) default auth.uid(),
  to_ids     uuid[] not null default '{}',
  message    text not null default '',
  created_at timestamptz not null default now()
);
create index on public.claim_approvals (claim_id, created_at);

-- ───────── 通知 ─────────
create table public.notifications (
  id         bigint generated always as identity primary key,
  claim_id   text not null references public.claims (id) on delete cascade,
  event      public.notification_event not null,
  actor_id   uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- 届いた相手（送信状況・既読管理）。メール/チャット送信はこのテーブルの INSERT をきっかけに Edge Function で行う
create table public.notification_recipients (
  notification_id bigint not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz,
  primary key (notification_id, user_id)
);
create index on public.notification_recipients (user_id, read_at);

-- ───────── 承認者・通知先の決定 ─────────

/**
 * クレームの承認者。
 * Lv.1 は現場（支店）の支店管理者。該当者がいなければ管理者が代わりに承認する。
 */
create function public.claim_approvers(p_claim_id text) returns setof uuid
language sql stable security definer set search_path = public as $$
  with c as (
    select cl.site_id, lar.role
    from claims cl join level_approver_roles lar on lar.level = cl.level
    where cl.id = p_claim_id
  ),
  direct as (
    select p.id from profiles p, c
    where p.role = c.role and (c.role <> 'branch_manager' or p.branch_id = c.site_id)
  )
  select id from direct
  union all
  select p.id from profiles p, c
  where c.role = 'branch_manager' and p.role = 'admin' and not exists (select 1 from direct)
$$;

/** 承認・差し戻しできるか：指定の承認者、またはそれより上位の役職 */
create function public.can_approve(p_user uuid, p_claim_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from claim_approvers(p_claim_id) a where a = p_user)
      or exists (
        select 1 from profiles p, claims c join level_approver_roles lar on lar.level = c.level
        where p.id = p_user and c.id = p_claim_id and role_rank(p.role) > role_rank(lar.role)
      )
$$;

/**
 * 通知を作成。通知先ルール：
 * - 新規報告：そのレベルの承認者 ＋ 担当者
 * - 承認依頼：そのレベルの承認者
 * - 承認／差し戻し：担当者 ＋ 登録者
 * いずれも操作した本人は除く。
 */
create function public.notify(p_claim_id text, p_event public.notification_event, p_actor uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_claim claims;
begin
  select * into v_claim from claims where id = p_claim_id;
  insert into notifications (claim_id, event, actor_id) values (p_claim_id, p_event, p_actor)
  returning id into v_id;

  insert into notification_recipients (notification_id, user_id)
  select distinct v_id, r.uid
  from (
    select a as uid from claim_approvers(p_claim_id) a where p_event in ('created', 'approval_requested')
    union all
    select v_claim.assignee_id where p_event in ('created', 'approved', 'returned')
    union all
    select v_claim.reporter_id where p_event in ('approved', 'returned')
  ) r
  where r.uid is not null and r.uid <> p_actor;

  return v_id;
end;
$$;

-- ───────── トリガー ─────────

-- 新規登録：レベルは種類から自動決定、担当者がいれば「対応中」から開始
create function public.claims_before_insert() returns trigger
language plpgsql as $$
begin
  select level into new.level from public.category_levels where category = new.category;
  new.status := case when new.assignee_id is null then 'received' else 'in_progress' end;
  new.completed_at := null;
  return new;
end;
$$;
create trigger claims_before_insert before insert on public.claims
for each row execute function public.claims_before_insert();

create function public.claims_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify(new.id, 'created', new.reporter_id);
  return null;
end;
$$;
create trigger claims_after_insert after insert on public.claims
for each row execute function public.claims_after_insert();

create function public.claims_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  -- 未割当（受付）のクレームに担当者が付いたら「対応中」へ
  if old.status = 'received' and old.assignee_id is null and new.assignee_id is not null then
    new.status := 'in_progress';
  end if;
  return new;
end;
$$;
create trigger claims_touch before update on public.claims
for each row execute function public.claims_touch();

-- 承認履歴の追加 = ステータス遷移（権限チェック込み）
create function public.claim_approvals_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_claim claims;
begin
  select * into v_claim from claims where id = new.claim_id for update;

  if new.action = 'requested' then
    if v_claim.status not in ('in_progress', 'returned') then
      raise exception '承認依頼できるのは対応中・差し戻しのクレームだけです';
    end if;
    if v_claim.assignee_id is distinct from new.from_id then
      raise exception '承認依頼できるのは担当者だけです';
    end if;
    new.to_ids := array(select claim_approvers(new.claim_id));
    update claims set status = 'pending_approval' where id = new.claim_id;
  else
    if v_claim.status <> 'pending_approval' then
      raise exception '承認待ちではありません';
    end if;
    if not can_approve(new.from_id, new.claim_id) then
      raise exception 'このクレームを承認する権限がありません';
    end if;
    if new.action = 'returned' and length(trim(new.message)) = 0 then
      raise exception '差し戻しの理由を入力してください';
    end if;
    update claims
    set status = case new.action when 'approved' then 'done'::claim_status else 'returned'::claim_status end,
        completed_at = case new.action when 'approved' then now() end
    where id = new.claim_id;
  end if;
  return new;
end;
$$;
create trigger claim_approvals_before_insert before insert on public.claim_approvals
for each row execute function public.claim_approvals_before_insert();

create function public.claim_approvals_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify(
    new.claim_id,
    case new.action
      when 'requested' then 'approval_requested'
      when 'approved' then 'approved'
      else 'returned'
    end::notification_event,
    new.from_id
  );
  return null;
end;
$$;
create trigger claim_approvals_after_insert after insert on public.claim_approvals
for each row execute function public.claim_approvals_after_insert();

-- ───────── 行レベルセキュリティ ─────────
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.level_approver_roles enable row level security;
alter table public.category_levels enable row level security;
alter table public.claims enable row level security;
alter table public.claim_photos enable row level security;
alter table public.claim_comments enable row level security;
alter table public.claim_approvals enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;

-- 社内システムのため、ログイン済みの社員はクレームを閲覧できる
create policy "read" on public.branches for select to authenticated using (true);
create policy "read" on public.profiles for select to authenticated using (true);
create policy "read" on public.level_approver_roles for select to authenticated using (true);
create policy "read" on public.category_levels for select to authenticated using (true);
create policy "read" on public.claims for select to authenticated using (true);
create policy "read" on public.claim_photos for select to authenticated using (true);
create policy "read" on public.claim_comments for select to authenticated using (true);
create policy "read" on public.claim_approvals for select to authenticated using (true);
create policy "read" on public.notifications for select to authenticated using (true);
-- 送信状況画面（デモ）では全員分を表示。本番で自分宛てだけにする場合は using (user_id = auth.uid()) に変更
create policy "read" on public.notification_recipients for select to authenticated using (true);

create policy "insert own" on public.claims for insert to authenticated
  with check (reporter_id = auth.uid());
-- 担当者の割り当て（未割当のクレームを自分が担当する）など。ステータス変更は承認履歴経由のみ
create policy "update by involved" on public.claims for update to authenticated
  using (assignee_id is null or assignee_id = auth.uid() or reporter_id = auth.uid());

create policy "insert own" on public.claim_comments for insert to authenticated
  with check (user_id = auth.uid());
create policy "insert own" on public.claim_photos for insert to authenticated with check (true);
create policy "insert own" on public.claim_approvals for insert to authenticated
  with check (from_id = auth.uid());

create policy "mark read" on public.notification_recipients for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ステータスと承認関連の列は承認履歴のトリガーからのみ変更させる
revoke update on public.claims from authenticated;
grant update (assignee_id, responsible_person, customer, amount, content, title) on public.claims to authenticated;
