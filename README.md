# クレーム管理システム

クレーム・インシデントの報告、承認、通知を管理する社内システム。

> ポートフォリオ公開用のリポジトリです。実際の企業向けに開発したシステムから、会社名・ドメイン・現場一覧などの固有情報を架空のものに置き換えています。登場する社名・人名・現場名・メールアドレスはすべて架空です。

Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui ／ DB・認証・写真: Supabase

## 開発

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。

### 動作モード

| モード | 条件 | ログイン | データ |
| --- | --- | --- | --- |
| テスト環境 | Supabase の環境変数が未設定 | 「Google でログイン」→ テスト用アカウントを選ぶ（切り替えて複数役職を試せる） | ブラウザ（localStorage）。「テストデータをリセット」で初期化 |
| 本番 | `.env.local` に Supabase の URL とキーを設定 | 会社の Google アカウントのみ | Supabase |

ログインしないと画面もデータも見られない（データは DB の行レベルセキュリティで保護）。

Supabase の準備は [docs/supabase-setup.md](docs/supabase-setup.md) を参照。

## 役職と承認レベル

| 承認レベル | 緊急度 | 承認者（確認者） | 対象の種類 |
| --- | --- | --- | --- |
| Lv.1 | 低 | 支店管理者（その現場の担当） | 備品紛失・破損 |
| Lv.2 | 中 | 管理者 | レジ金過不足 |
| Lv.3 | 高 | 社長 | インシデント/クレーム、車両関連 |

- 役職：社長 ＞ 管理者 ＞ 支店管理者 ＞ 一般社員
- 緊急度（= 承認レベル）は報告の種類で自動的に決まる
- 上位の役職は下位レベルも承認できる（例：社長は Lv.1〜3 すべて）
- 支店管理者は複数の現場を担当できる。Lv.1 は現場名が一致する担当の支店管理者が承認し、いなければ管理者が承認する
- 現場は自由入力（登録済みの現場は入力候補に出る）。出張は「出張買取」と入力し、住所は経緯・内容に書く

## ステータスの流れ

受付（未割当）→ 対応中（担当者あり）→ 承認待ち（担当者が承認依頼）→ 完了（承認）
承認者が差し戻すと「差し戻し」になり、担当者が再度承認依頼する。

## 通知先ルール

| タイミング | 届く相手 |
| --- | --- |
| 新規報告 | そのレベルの承認者 ＋ 担当者 |
| 承認依頼 | そのレベルの承認者 |
| 承認・差し戻し | 担当者 ＋ 登録者 |

操作した本人には届かない。「送信状況」画面で通知ごとの届いた／届かなかった社員を確認できる。

本番では同じ相手にメールも送る（Supabase Edge Function + Resend、1分ごと、失敗は自動で再送）。設定は [docs/supabase-setup.md](docs/supabase-setup.md) の「通知メール」。

ルールの実装：
- 画面（デモ）：`src/lib/domain.ts` の `approversFor` / `recipientsFor`
- DB：`supabase/migrations/20261116000000_init.sql` の `claim_approvers` / `notify`（トリガーで自動実行、RLS で権限チェック）

## ディレクトリ

- `src/app/login` — ログイン（本番：Google／テスト環境：テスト用アカウント選択）
- `src/app/(app)/claims` — 一覧・詳細・新規登録（PC では一覧＋詳細の2ペイン）
- `src/app/(app)/dashboard` — ダッシュボード
- `src/app/(app)/notifications` — 通知の送信状況
- `src/lib/domain.ts` — 役職・レベル・ステータス・通知ルール
- `src/lib/store.tsx` — 画面が使う `useStore()`
- `src/lib/demo-store.tsx` / `src/lib/supabase-store.tsx` — デモ版／Supabase 版の実装
- `src/app/globals.css` — デザイントークン（Figma Foundations 準拠）
- `supabase/migrations` — DB スキーマ
- `supabase/functions/send-notification-emails` — 通知メールの送信（Edge Function）。メール本文は `supabase/functions/_shared/notification-email.ts`
- `supabase/email-cron.sql` — メール送信の定期実行の設定

## テスト

```bash
npm test          # 通知メール（本文・送信・再送）のテスト
npm run typecheck # 型チェック（アプリ＋Edge Function）
```

## shadcn/ui コンポーネントの追加

```bash
npx shadcn@latest add <component>
```
