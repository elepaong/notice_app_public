"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChartColumn,
  CircleUser,
  FileText,
  FlaskConical,
  LogOut,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import { CATEGORY_LABEL, NOTIFICATION_EVENT_LABEL, URGENCY_LABEL, describeUser } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/claims", label: "一覧", title: "クレーム一覧", icon: FileText },
  { href: "/dashboard", label: "ダッシュボード", title: "ダッシュボード", icon: ChartColumn },
  { href: "/notifications", label: "送信状況", title: "通知の送信状況", icon: Megaphone },
] as const;

/** モバイルでヘッダーを「戻る＋タイトル」にするページ */
function subPage(pathname: string): string | null {
  if (pathname === "/claims/new") return "新規登録";
  if (pathname.startsWith("/claims/")) return "クレーム詳細";
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, me, mode } = useStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !me) router.replace("/login");
  }, [ready, me, router]);

  if (!ready || !me) {
    return <div className="min-h-dvh bg-background" />;
  }

  const current = NAV.find((n) => pathname.startsWith(n.href)) ?? NAV[0];
  const sub = subPage(pathname);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b bg-white px-4 pt-[var(--safe-top)] text-navy">
        {sub && (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/claims"))}
            className="-ml-2 flex size-10 cursor-pointer items-center justify-center lg:hidden"
            aria-label="戻る"
          >
            <ArrowLeft className="size-6" />
          </button>
        )}
        <Link
          href="/claims"
          className={cn("shrink-0 text-base font-bold tracking-wide text-gold", sub && "hidden lg:inline")}
        >
          SAMPLE CO.
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold whitespace-nowrap">
          <span className={cn(sub && "hidden lg:inline")}>{current.title}</span>
          {sub && <span className="lg:hidden">{sub}</span>}
        </h1>
        {mode === "demo" && (
          <span
            title="テスト環境（データはこのブラウザ内だけに保存されます）"
            className="hidden shrink-0 items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-white sm:inline-flex"
          >
            <FlaskConical className="size-3" />
            テスト
          </span>
        )}
        <div className={cn("ml-auto flex items-center gap-1", sub && "hidden lg:flex")}>
          <NotificationBell />
          <RefreshButton />
          <AccountMenu />
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="sticky top-[var(--header-h)] hidden h-[calc(100dvh-var(--header-h))] w-24 shrink-0 flex-col items-center gap-3 border-r bg-white pt-4 lg:flex">
          {NAV.map((n) => (
            <NavItem key={n.href} {...n} active={n.href === current.href} />
          ))}
        </nav>
        <main className={cn("min-w-0 flex-1", !sub && "pb-[calc(5rem+var(--safe-bottom))] lg:pb-0")}>{children}</main>
      </div>

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+var(--safe-bottom))] grid-cols-3 border-t bg-card pb-[var(--safe-bottom)] lg:hidden",
          sub && "hidden",
        )}
      >
        {NAV.map((n) => (
          <NavItem key={n.href} {...n} active={n.href === current.href} />
        ))}
      </nav>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link href={href} className="flex flex-col items-center justify-center gap-1 text-xs">
      <span
        className={cn(
          "flex h-8 w-14 items-center justify-center rounded-full",
          active ? "text-navy" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className={cn(active ? "font-semibold text-navy" : "text-muted-foreground")}>{label}</span>
    </Link>
  );
}

function RefreshButton() {
  const { refresh } = useStore();
  const [spinning, setSpinning] = useState(false);
  return (
    <HeaderButton
      label="更新"
      onClick={async () => {
        setSpinning(true);
        try {
          await refresh();
        } finally {
          setSpinning(false);
        }
      }}
    >
      <RefreshCw className={cn("size-5", spinning && "animate-spin")} />
    </HeaderButton>
  );
}

function HeaderButton({
  label,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="relative flex size-10 cursor-pointer items-center justify-center rounded-full hover:bg-muted"
      {...props}
    >
      {children}
    </button>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function NotificationBell() {
  const { me, notifications, claims, userById, markRead, markAllRead } = useStore();
  const router = useRouter();
  const { open, setOpen, ref } = usePopover();
  if (!me) return null;

  const mine = notifications.filter((n) => n.recipientIds.includes(me.id));
  const unread = mine.filter((n) => !n.readByIds.includes(me.id)).length;

  return (
    <div className="relative" ref={ref}>
      <HeaderButton label={`通知 ${unread}件の未読`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-urg-high px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </HeaderButton>
      {open && (
        <div className="fixed inset-x-3 top-[var(--header-h)] z-40 max-h-[70dvh] overflow-y-auto rounded-xl bg-card text-foreground shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:w-96">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">通知</span>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="cursor-pointer text-xs text-navy-2 hover:underline">
                すべて既読にする
              </button>
            )}
          </div>
          {mine.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">通知はありません</p>
          ) : (
            <ul>
              {mine.map((n) => {
                const claim = claims.find((c) => c.id === n.claimId);
                const isUnread = !n.readByIds.includes(me.id);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        markRead(n.id);
                        setOpen(false);
                        router.push(`/claims/${n.claimId}`);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer gap-3 px-4 py-3 text-left hover:bg-muted",
                        isUnread && "bg-accent/40",
                      )}
                    >
                      <span
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", isUnread ? "bg-navy" : "bg-transparent")}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {claim && `[${URGENCY_LABEL[claim.level]}] `}
                          {NOTIFICATION_EVENT_LABEL[n.event]}
                          {claim && `・${CATEGORY_LABEL[claim.category]}`}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {claim?.title} ・ {userById(n.actorId)?.name} ・ {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { me, logout, mode } = useStore();
  const router = useRouter();
  const { open, setOpen, ref } = usePopover();
  if (!me) return null;
  return (
    <div className="relative" ref={ref}>
      <HeaderButton
        label={mode === "demo" ? "アカウント（テスト環境）" : "アカウント"}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <CircleUser className="size-5" />
        {mode === "demo" && (
          <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full border border-white bg-gold sm:hidden" />
        )}
      </HeaderButton>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl bg-card p-2 text-foreground shadow-xl">
          <div className="px-3 py-2">
            {mode === "demo" && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-white">
                <FlaskConical className="size-3" />
                テスト環境
              </span>
            )}
            <div className="text-sm font-semibold">{me.name}</div>
            {me.email && <div className="truncate text-xs text-muted-foreground">{me.email}</div>}
            <div className="text-xs leading-snug text-muted-foreground">{describeUser(me)}</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            <LogOut className="size-4" />
            {mode === "demo" ? "アカウントを切り替え" : "ログアウト"}
          </button>
        </div>
      )}
    </div>
  );
}
