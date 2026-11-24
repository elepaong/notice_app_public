-- 本番ログインを会社の Google アカウント（Google Workspace）に限定する

-- ───────── 許可するメールドメイン ─────────
-- 例：insert into allowed_email_domains values ('example.com');
-- 1件も登録がない間は、誰もアカウントを作成できない（設定漏れで社外の人が入れないように）
create table public.allowed_email_domains (
  domain text primary key check (domain = lower(domain) and domain not like '@%')
);
alter table public.allowed_email_domains enable row level security;
-- ポリシーなし：ブラウザからは読み書きできない（SQL Editor から管理者が設定）
revoke all on public.allowed_email_domains from anon, authenticated;

-- ───────── 社員情報にメールアドレスを保持 ─────────
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;
create unique index profiles_email_key on public.profiles (lower(email));

-- ───────── アカウント作成時：ドメインを確認してから社員情報を作成 ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if v_domain = '' or not exists (select 1 from allowed_email_domains where domain = v_domain) then
    -- ここで例外にするとアカウント自体が作成されない（Google から戻った画面にエラーが返る）
    raise exception '会社のアカウント以外ではログインできません: %', coalesce(new.email, '(メールなし)');
  end if;

  insert into profiles (id, name, role, branch_id, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    'staff',
    null,
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- set_profile はメールも保存する
create or replace function public.set_profile(p_email text, p_name text, p_role public.user_role, p_branch text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_email text;
  v_branch smallint;
begin
  select id, email into v_uid, v_email from auth.users where lower(email) = lower(p_email);
  if v_uid is null then
    raise exception 'アカウントが見つかりません（先に一度 Google でログインしてもらってください）: %', p_email;
  end if;
  if p_branch is not null then
    select id into v_branch from branches where name = p_branch;
    if v_branch is null then
      raise exception '拠点が見つかりません: %', p_branch;
    end if;
  end if;
  insert into profiles (id, name, role, branch_id, email) values (v_uid, p_name, p_role, v_branch, v_email)
  on conflict (id) do update
    set name = excluded.name, role = excluded.role, branch_id = excluded.branch_id, email = excluded.email;
end;
$$;
revoke execute on function public.set_profile(text, text, public.user_role, text) from public, anon, authenticated;
