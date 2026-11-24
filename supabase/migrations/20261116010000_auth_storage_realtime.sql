-- Supabase 接続用：アカウント連携・写真ストレージ・リアルタイム・権限の締め付け

-- ───────── 拠点 ─────────
-- 本社など「現場」として選ばない拠点は is_site = false
alter table public.branches add column is_site boolean not null default true;

-- 拠点が決まっていない社員も登録できるようにする（管理者が後で設定）
alter table public.profiles alter column branch_id drop not null;

-- ───────── アカウント作成時に社員情報（profiles）を自動作成 ─────────
-- 役職は必ず「一般社員」で作成。昇格は管理者が set_profile() かテーブルエディタで行う
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, role, branch_id)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '名前未設定'
    ),
    'staff',
    (select id from branches where name = new.raw_user_meta_data ->> 'branch')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

/**
 * 管理者用：メールアドレスで社員の名前・役職・拠点を設定（SQL エディタから実行）
 *   select set_profile('tanaka@example.com', '田中 一郎', 'admin', '本社');
 */
create function public.set_profile(p_email text, p_name text, p_role public.user_role, p_branch text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_branch smallint;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then
    raise exception 'アカウントが見つかりません: %', p_email;
  end if;
  if p_branch is not null then
    select id into v_branch from branches where name = p_branch;
    if v_branch is null then
      raise exception '拠点が見つかりません: %', p_branch;
    end if;
  end if;
  insert into profiles (id, name, role, branch_id) values (v_uid, p_name, p_role, v_branch)
  on conflict (id) do update set name = excluded.name, role = excluded.role, branch_id = excluded.branch_id;
end;
$$;

-- ───────── 関数の実行権限 ─────────
-- 通知の作成や社員情報の変更をブラウザから直接呼べないようにする（トリガー経由のみ）。
-- Supabase は新しい関数に anon / authenticated への EXECUTE を個別に付けるので、public だけでなく両方から外す
revoke execute on function public.notify(text, public.notification_event, uuid) from public, anon, authenticated;
revoke execute on function public.set_profile(text, text, public.user_role, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.claims_before_insert() from public, anon, authenticated;
revoke execute on function public.claims_after_insert() from public, anon, authenticated;
revoke execute on function public.claims_touch() from public, anon, authenticated;
revoke execute on function public.claim_approvals_before_insert() from public, anon, authenticated;
revoke execute on function public.claim_approvals_after_insert() from public, anon, authenticated;
revoke execute on function public.role_rank(public.user_role) from anon;
-- 承認者の参照はログイン済みの社員のみ
revoke execute on function public.claim_approvers(text) from public, anon;
revoke execute on function public.can_approve(uuid, text) from public, anon;
grant execute on function public.claim_approvers(text) to authenticated;
grant execute on function public.can_approve(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
end;
$$;

-- ───────── リアルタイム（他の社員の操作を即時反映） ─────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.claims, public.claim_comments, public.claim_approvals, public.claim_photos,
      public.notifications, public.notification_recipients;
  end if;
end;
$$;

-- ───────── 写真ストレージ（非公開バケット） ─────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('claim-photos', 'claim-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy "claim photos: read" on storage.objects for select to authenticated
      using (bucket_id = 'claim-photos')
    $p$;
    -- パスは「クレームID/ファイル名」。存在するクレームにだけアップロードできる
    execute $p$
      create policy "claim photos: upload" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'claim-photos'
        and exists (select 1 from public.claims c where c.id = (storage.foldername(name))[1])
      )
    $p$;
  end if;
end;
$$;
