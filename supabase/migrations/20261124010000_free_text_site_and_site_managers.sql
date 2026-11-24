-- 現場を自由入力にし、支店管理者が複数の現場を担当できるようにする
--
-- ・claims.site：入力された現場名（文字列）。branches の現場一覧は入力候補として使う
-- ・site_managers：支店管理者と担当現場の対応（1人で複数可、1現場に複数人も可）
-- ・Lv.1 の承認者は「現場名が一致する担当現場を持つ支店管理者」。いなければ管理者が代行
--   一致判定は空白・全角半角・大文字小文字を無視（normalize_site）

-- ───────── 現場名の正規化 ─────────
create function public.normalize_site(p text) returns text
language sql immutable parallel safe as $$
  select lower(regexp_replace(normalize(coalesce(p, ''), NFKC), '\s+', '', 'g'))
$$;

-- 表記ゆれで同じ現場が二重登録されないように
create unique index branches_normalized_name_key on public.branches (public.normalize_site(name));

-- ───────── クレームの現場を文字列に ─────────
alter table public.claims add column site text;
update public.claims c set site = b.name from public.branches b where b.id = c.site_id;
alter table public.claims alter column site set not null;
alter table public.claims add constraint claims_site_not_blank check (length(trim(site)) > 0);
alter table public.claims drop column site_id;
create index claims_normalized_site_idx on public.claims (public.normalize_site(site));

create or replace function public.claims_before_insert() returns trigger
language plpgsql as $$
begin
  new.site := regexp_replace(trim(new.site), '\s+', ' ', 'g');
  select level into new.level from public.category_levels where category = new.category;
  new.status := case when new.assignee_id is null then 'received' else 'in_progress' end;
  new.completed_at := null;
  return new;
end;
$$;
revoke execute on function public.claims_before_insert() from public, anon, authenticated;

-- 現場名の修正（入力ミスなど）も担当者・登録者が行えるように
grant update (site) on public.claims to authenticated;

-- ───────── 支店管理者の担当現場 ─────────
create table public.site_managers (
  site_id smallint not null references public.branches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (site_id, user_id)
);
create index on public.site_managers (user_id);
alter table public.site_managers enable row level security;
create policy "read" on public.site_managers for select to authenticated using (true);
-- 変更は管理者が SQL Editor（set_managed_sites）で行う
revoke insert, update, delete on public.site_managers from anon, authenticated;
revoke all on public.site_managers from anon;

-- これまでの「所属拠点 = 担当現場」を引き継ぐ
insert into public.site_managers (site_id, user_id)
select p.branch_id, p.id from public.profiles p join public.branches b on b.id = p.branch_id
where p.role = 'branch_manager' and b.is_site
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.site_managers;
  end if;
end;
$$;

-- ───────── 承認者の決定（現場名で照合） ─────────
create or replace function public.claim_approvers(p_claim_id text) returns setof uuid
language sql stable security definer set search_path = public as $$
  with c as (
    select cl.site, lar.role
    from claims cl join level_approver_roles lar on lar.level = cl.level
    where cl.id = p_claim_id
  ),
  direct as (
    -- Lv.2 / Lv.3：その役職の全員
    select p.id from profiles p, c
    where c.role <> 'branch_manager' and p.role = c.role
    union
    -- Lv.1：現場を担当する支店管理者
    select p.id
    from c
    join branches b on normalize_site(b.name) = normalize_site(c.site)
    join site_managers sm on sm.site_id = b.id
    join profiles p on p.id = sm.user_id and p.role = 'branch_manager'
    where c.role = 'branch_manager'
  )
  select id from direct
  union all
  -- 担当の支店管理者がいない現場は管理者が代行
  select p.id from profiles p, c
  where c.role = 'branch_manager' and p.role = 'admin' and not exists (select 1 from direct)
$$;
revoke execute on function public.claim_approvers(text) from public, anon;
grant execute on function public.claim_approvers(text) to authenticated;

/**
 * 管理者用：支店管理者の担当現場を設定（指定した一覧で置き換え）
 *   select set_managed_sites('suzuki@example.com', array['みなと中央店', 'しおかぜ店']);
 * 現場名の表記ゆれ（空白・全角半角）は吸収。未登録の現場名はエラー（先に branches に追加）
 */
create function public.set_managed_sites(p_email text, p_sites text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_unknown text;
begin
  select p.id into v_uid from profiles p join auth.users u on u.id = p.id where lower(u.email) = lower(p_email);
  if v_uid is null then
    raise exception 'アカウントが見つかりません（先に一度 Google でログインしてもらってください）: %', p_email;
  end if;
  select string_agg(s, '、') into v_unknown
  from unnest(p_sites) s
  where not exists (select 1 from branches b where normalize_site(b.name) = normalize_site(s));
  if v_unknown is not null then
    raise exception '登録されていない現場があります: %（insert into branches (name) values (...) で追加してください）', v_unknown;
  end if;

  delete from site_managers where user_id = v_uid;
  insert into site_managers (site_id, user_id)
  select distinct b.id, v_uid from unnest(p_sites) s join branches b on normalize_site(b.name) = normalize_site(s)
  on conflict do nothing;
end;
$$;
revoke execute on function public.set_managed_sites(text, text[]) from public, anon, authenticated;
