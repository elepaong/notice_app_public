-- 初期データ
-- 本番の Supabase で、マイグレーションの後に SQL Editor で実行する。
-- 現場一覧は src/lib/sites.ts と同じ内容（現場を追加するときは下の形で1行ずつ追加すればよい）。

-- ───────── ログインを許可する会社の Google Workspace ドメイン ─────────
insert into public.allowed_email_domains (domain) values
  ('example.com')
on conflict do nothing;

-- ───────── 拠点 ─────────
-- 本社：社員の所属のみ（現場の選択肢には出ない）
insert into public.branches (name, is_site) values ('本社', false)
on conflict (name) do nothing;

-- 現場（クレーム・事故の発生場所）。画面では入力候補として表示される（一覧にない現場名も入力できる）
-- 出張での事故は「出張買取」とし、住所は経緯・内容に書く
insert into public.branches (name, is_site) values
  ('みなと中央店', true),
  ('みなと南店', true),
  ('しおかぜ店', true),
  ('あおば店', true),
  ('さくら台店', true),
  ('ひばり店', true),
  ('かえで店', true),
  ('つばき店', true),
  ('すずらん店', true),
  ('ひまわり店', true),
  ('あさひ店', true),
  ('ゆうひ店', true),
  ('みどり店', true),
  ('出張買取', true)
on conflict (name) do nothing;
