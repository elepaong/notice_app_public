# Supabase セットアップ手順（本番：会社の Google アカウントでログイン）

所要時間：30分ほど。Supabase と Google Cloud のダッシュボードで行います。

## 環境の違い

| | 本番 | テスト環境 |
| --- | --- | --- |
| 条件 | `.env.local`（または Vercel）に Supabase の URL とキーを設定 | 未設定 |
| ログイン | 会社の Google アカウントのみ | 「Google でログイン」→ テスト用アカウントを選ぶ（複数アカウントを切り替えて試せる） |
| データ | Supabase | ブラウザ内（localStorage） |

## 1. Supabase プロジェクトを作成

1. https://supabase.com で **New project**（Region は **Northeast Asia (Tokyo)** 推奨）
2. **Project Settings → General** の **Reference ID**（`https://<ID>.supabase.co` の `<ID>`）を控える

## 2. テーブルを作成（SQL Editor）

**SQL Editor** で、以下を **この順番で** 貼り付けて **Run**：

1. `supabase/migrations/20261116000000_init.sql`
2. `supabase/migrations/20261116010000_auth_storage_realtime.sql`
3. `supabase/migrations/20261124000000_google_workspace_login.sql`
4. `supabase/migrations/20261124010000_free_text_site_and_site_managers.sql`
5. `supabase/migrations/20261125000000_notification_emails.sql`
6. `supabase/seed.sql` … 会社のドメイン `example.com` とサンプルの現場14か所（＋本社）を登録

> ドメインが1件も登録されていない間は、誰もログインできません（安全のため）。

### 現場について

- 新規登録の「現場」は **自由入力**。登録済みの現場は入力候補として表示される
- 一覧にない現場名もそのまま登録できる（その場合 Lv.1 は管理者が承認）
- 出張での事故は「**出張買取**」と入力し、住所は経緯・内容に書く
- 現場名の照合は空白・全角半角・大文字小文字を無視する（「しおかぜ　店」＝「しおかぜ店」、「ＭＩＮＡＴＯ」＝「minato」）

よく使う現場を候補に追加するとき：

```sql
insert into branches (name, is_site) values ('新しい現場名', true);
```

（テスト環境の候補一覧は `src/lib/sites.ts`。両方そろえておく）

## 3. Google Cloud で OAuth クライアントを作成

会社の Google Workspace の管理者アカウントで https://console.cloud.google.com を開く。

1. プロジェクトを作成（または既存を選択）
2. **Google Auth Platform → Branding**（旧「OAuth 同意画面」）
   - **User type：Internal（内部）** を選ぶ → **会社の Google Workspace のユーザーしかログインできなくなる**
   - アプリ名：`クレーム管理システム`
3. **Clients → Create client**
   - Application type：**Web application**
   - Authorized redirect URIs：`https://<ID>.supabase.co/auth/v1/callback`
4. 作成された **Client ID** と **Client secret** を控える

## 4. Supabase の認証設定

1. **Authentication → Sign In / Providers**
   - **Google** を有効にし、手順3の Client ID / Client secret を貼り付けて保存
   - **Email** は **無効** にする（パスワードでのログインを使わないため）
   - **Allow new users to sign up** は **オン のまま**（初回の Google ログインで社員が自動登録されるため。社外のアカウントは DB 側で拒否される）
2. **Authentication → URL Configuration**
   - Site URL：本番の URL（例：`https://claims.example.com`）
   - Redirect URLs に追加：`https://<本番URL>/login`、`http://localhost:3000/login`

## 5. 社員の役職を設定

1. 社員に一度 **Google でログイン** してもらう（「一般社員」として自動登録される）
2. 管理者が **SQL Editor** で役職・所属を設定：

```sql
select set_profile('ito@example.com',    '伊藤 誠',   'president',      '本社');
select set_profile('tanaka@example.com', '田中 一郎', 'admin',          '本社');
select set_profile('suzuki@example.com', '鈴木 健',   'branch_manager', 'みなと中央店');
select set_profile('sato@example.com',   '佐藤 花子', 'staff',          'みなと中央店');
```

| 役職の値 | 意味 | 承認するレベル |
| --- | --- | --- |
| `president` | 社長 | Lv.3（緊急度 高） |
| `admin` | 管理者 | Lv.2（緊急度 中） |
| `branch_manager` | 支店管理者 | Lv.1（緊急度 低、担当現場のみ） |
| `staff` | 一般社員 | — |

> 役職は社員本人には変更できません（DB 側で禁止）。
>
> 担当の支店管理者がいない現場の Lv.1 は、管理者（`admin`）が代わりに承認します。

3. 支店管理者には **担当現場** を設定（1人で何か所でも可。1つの現場を複数人で担当することも可）：

```sql
select set_managed_sites('suzuki@example.com',
  array['みなと中央店', 'みなと南店', 'しおかぜ店']);
```

- 指定した一覧で **置き換え**（追加・削除はこの一覧を直して再実行）
- 候補一覧（branches）にない現場名はエラーになる → 先に `insert into branches ...` で追加

担当現場の確認：

```sql
select p.name, string_agg(b.name, '、' order by b.name) as 担当現場
from site_managers sm join profiles p on p.id = sm.user_id join branches b on b.id = sm.site_id
group by p.name order by p.name;
```

## 6. アプリに接続情報を設定

**Project Settings → API Keys** と **Data API** から：

```
NEXT_PUBLIC_SUPABASE_URL=https://<ID>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Publishable key（旧 anon key）>
NEXT_PUBLIC_GOOGLE_WORKSPACE_DOMAIN=example.com
```

- ローカル：`.env.example` を `.env.local` にコピーして記入 → `npm run dev`
- Vercel：Settings → Environment Variables に登録して再デプロイ

> **Secret key（service_role）はアプリに設定しないこと。**

## 7. 通知メール

通知が作られると、届け先ごとにメールを送ります（新規報告・承認依頼・承認・差し戻し）。
仕組み：通知 → 送信キュー（`email_outbox`）→ 1分ごとに Edge Function `send-notification-emails` が Resend 経由で送信。失敗は 1・4・9・16 分後に再送（最大5回）。

### 7-1. Resend（メール送信サービス）

1. https://resend.com でアカウント作成
2. **Domains → Add Domain** で `example.com` を追加し、表示された DNS レコード（SPF・DKIM）を会社の DNS に登録 → **Verified** になるまで待つ
   - 会社のメール（Google Workspace）の設定に影響しないよう、送信専用のサブドメイン（例：`notify.example.com`）にするのがおすすめ
3. **API Keys → Create API Key**（権限は **Sending access** のみ）→ 控える

### 7-2. Edge Function をデプロイ

[Supabase CLI](https://supabase.com/docs/guides/cli) で（リポジトリのルートで実行）：

```bash
supabase login
supabase link --project-ref <Reference ID>
supabase functions deploy send-notification-emails --no-verify-jwt
```

> `--no-verify-jwt`：定期実行からの呼び出しはログイントークンではなく合言葉（`EMAIL_CRON_SECRET`）で確認するため。

シークレットを登録（合言葉は `openssl rand -hex 32` などで作ったランダムな文字列）：

```bash
supabase secrets set \
  RESEND_API_KEY=<Resend の API キー> \
  MAIL_FROM="クレーム管理システム <claims@notify.example.com>" \
  APP_URL=https://<本番URL> \
  EMAIL_CRON_SECRET=<ランダムな文字列>
```

### 7-3. 定期実行を設定

`supabase/email-cron.sql` の `<...>` を書き換えて **SQL Editor** で実行（1回だけ）。

### 運用

- 送信状況はアプリの **送信状況** 画面で確認できる（送信済み／送信待ち／失敗／送信なし）
- 失敗の確認：`select id, to_email, attempts, last_error from email_outbox where status = 'failed' order by id desc;`
- 社員ごとにメール通知を止める：`update profiles set email_notifications = false where email = 'xxx@example.com';`
- Edge Function のログ：Supabase ダッシュボード → **Edge Functions → send-notification-emails → Logs**

## 確認

1. 会社の Google アカウントでログインできる
2. 個人の Gmail ではログインできず「会社の Google アカウントでログインしてください」と表示される
3. クレームを登録すると、承認者の通知ベルに件数が付く
4. 担当者が承認依頼 → 承認者が承認 → ステータスが「完了」になる
5. 写真を追加できる（Storage に `claim-photos` バケットが作成されている）
6. 承認者にメールが届く（1分以内）。送信状況画面のメールアイコンが「送信済み」になる

## 制限の仕組み（3重）

1. Google 側：同意画面を **Internal** にすると社外アカウントはそもそも選べない
2. DB 側：`allowed_email_domains` にないドメインはアカウントが作成されない（最終的な防御）
3. 画面側：ドメインが違えば即ログアウト（表示のため）
