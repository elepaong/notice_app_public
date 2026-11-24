"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Headset, X } from "lucide-react";
import { approvalLevelOf, describeUser } from "@/lib/domain";
import { initial } from "@/lib/format";
import { useStore } from "@/lib/store";
import { GOOGLE_WORKSPACE_DOMAIN } from "@/lib/supabase/client";

/**
 * ログイン画面
 * - 本番：会社の Google アカウントでログイン
 * - テスト環境：同じ画面。「Google でログイン」を押すとテスト用アカウントを選べる
 */
export default function LoginPage() {
  const { mode, me, ready, authError, signInWithGoogle } = useStore();
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTest = mode === "demo";

  useEffect(() => {
    if (ready && me) router.replace("/claims");
  }, [ready, me, router]);

  const onGoogle = async () => {
    if (isTest) {
      setChooserOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(); // Google の画面へ移動する
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const message = error ?? authError;

  return (
    <div className="relative min-h-dvh bg-background">
      <div className="absolute inset-x-0 top-0 h-[calc(352px+var(--safe-top))] bg-gradient-to-b from-navy to-navy-2" />
      <div className="relative mx-auto flex max-w-md flex-col items-center px-5 pt-[calc(88px+var(--safe-top))] pb-[calc(2.5rem+var(--safe-bottom))]">
        {isTest && (
          <span className="absolute top-[calc(1.5rem+var(--safe-top))] inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-white">
            <FlaskConical className="size-3.5" />
            テスト環境
          </span>
        )}
        <div className="flex size-[76px] items-center justify-center rounded-full bg-white">
          <Headset className="size-9 text-navy" strokeWidth={2.2} />
        </div>
        <p className="mt-5 text-[15px] font-bold tracking-[3px] text-gold">SAMPLE CO.</p>
        <h1 className="mt-1 text-2xl font-bold text-white">クレーム管理</h1>

        <div className="mt-8 w-full rounded-2xl bg-card px-5 pt-7 pb-6 shadow-[0_8px_28px_rgba(20,40,75,0.10)]">
          <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
            会社の Google アカウントでログインしてください。
            {!isTest && GOOGLE_WORKSPACE_DOMAIN && (
              <>
                <br />（@{GOOGLE_WORKSPACE_DOMAIN}）
              </>
            )}
          </p>
          <button
            type="button"
            onClick={onGoogle}
            disabled={!ready || busy}
            className="mt-5 flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-[#f2f2f2] text-[15px] font-medium text-[#1f1f1f] transition-colors hover:bg-[#e8e8e8] disabled:cursor-default disabled:opacity-60"
          >
            <GoogleMark />
            {busy ? "Google に移動中…" : "Google でログイン"}
          </button>
          {message && (
            <p role="alert" className="mt-4 rounded-lg bg-st-returned-bg px-3 py-2 text-center text-sm text-st-returned">
              {message}
            </p>
          )}
          {isTest && (
            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              テスト環境では Google の代わりに、テスト用アカウントを選んでログインします。
              アカウントを切り替えて、役職ごとの承認や通知の届き方を試せます。
            </p>
          )}
        </div>

        {isTest && <TestEnvInfo />}
      </div>

      {chooserOpen && <TestAccountChooser onClose={() => setChooserOpen(false)} />}
    </div>
  );
}

/** テスト用：Google のアカウント選択画面の代わり */
function TestAccountChooser({ onClose }: { onClose: () => void }) {
  const { users, login } = useStore();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chooser-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-card pb-[calc(1rem+var(--safe-bottom))] sm:max-w-md sm:rounded-2xl sm:pb-4"
      >
        <div className="sticky top-0 flex items-start gap-3 border-b bg-card px-5 pt-5 pb-4">
          <GoogleMark className="mt-0.5 size-5" />
          <div className="flex-1">
            <h2 id="chooser-title" className="text-lg font-semibold">
              アカウントの選択
            </h2>
            <p className="text-xs text-muted-foreground">テスト用アカウント（クレーム管理に移動）</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="cursor-pointer p-1">
            <X className="size-5" />
          </button>
        </div>
        <ul>
          {users.map((u) => {
            const level = approvalLevelOf(u.role);
            return (
              <li key={u.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    login(u.id);
                    router.push("/claims");
                  }}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-3 text-left hover:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-base font-semibold text-white">
                    {initial(u.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{describeUser(u)}</span>
                  </span>
                  {level && (
                    <span className="shrink-0 rounded-full bg-chip px-3 py-1 text-xs text-muted-foreground">
                      承認 Lv.{level}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TestEnvInfo() {
  const { resetDemo } = useStore();
  return (
    <>
      <div className="mt-6 w-full rounded-xl bg-sunken p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">承認レベル</p>
        <p>Lv.1（緊急度 低）… 支店管理者</p>
        <p>Lv.2（緊急度 中）… 管理者</p>
        <p>Lv.3（緊急度 高）… 社長</p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (confirm("テストデータを初期状態に戻しますか？")) resetDemo();
        }}
        className="mt-4 cursor-pointer text-xs text-muted-foreground underline"
      >
        テストデータをリセット
      </button>
    </>
  );
}

/** Google の「G」マーク（Google ログインボタンのガイドライン準拠） */
function GoogleMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
