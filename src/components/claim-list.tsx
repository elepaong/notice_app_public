"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, MessageSquare, Plus, Search } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, STATUSES, STATUS_LABEL, type Category, type Claim, type Status } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar, CategoryIcon, Chip, StatusBadge, UrgencyBadge } from "./claim-ui";

export function ClaimList({ selectedId }: { selectedId?: string }) {
  const { claims, me, userById } = useStore();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return claims.filter((c) => {
      if (category && c.category !== category) return false;
      if (status && c.status !== status) return false;
      if (mineOnly && c.assigneeId !== me?.id) return false;
      if (query) {
        const hay = [c.title, c.content, c.customer, c.site, c.id, userById(c.assigneeId)?.name ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [claims, q, category, status, mineOnly, me, userById]);

  return (
    <div className="relative">
      <div className="space-y-3 px-3 pt-3 lg:px-3">
        <label className="flex h-11 items-center gap-3 rounded-lg bg-sunken px-4">
          <Search className="size-5 text-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="件名・顧客・内容で検索"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            {category === null && <Check className="size-4" />}全種類
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {category === c ? <Check className="size-4" /> : <CategoryIcon category={c} className="size-4" />}
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          <Chip active={mineOnly} onClick={() => setMineOnly(!mineOnly)}>
            {mineOnly && <Check className="size-4" />}自分の担当
          </Chip>
          <Chip active={status === null} onClick={() => setStatus(null)}>
            {status === null && <Check className="size-4" />}全ステータス
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? null : s)}>
              {status === s && <Check className="size-4" />}
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-divider border-t border-divider pb-24">
        {filtered.length === 0 && (
          <li className="py-16 text-center text-sm text-muted-foreground">該当するクレームはありません</li>
        )}
        {filtered.map((c) => (
          <li key={c.id}>
            <ClaimCard claim={c} selected={c.id === selectedId} />
          </li>
        ))}
      </ul>

      <Link
        href="/claims/new"
        className="fixed right-4 bottom-[calc(5rem+var(--safe-bottom))] z-20 inline-flex h-14 items-center gap-3 rounded-2xl bg-navy px-6 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(20,40,75,0.22)] hover:bg-navy-2 lg:bottom-4"
      >
        <Plus className="size-6" />
        新規登録
      </Link>
    </div>
  );
}

function ClaimCard({ claim: c, selected }: { claim: Claim; selected: boolean }) {
  const { userById } = useStore();
  const assignee = userById(c.assigneeId);
  return (
    <Link
      href={`/claims/${c.id}`}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "block px-4 py-3.5 transition-colors hover:bg-sunken",
        selected && "bg-[#eef3fb] hover:bg-[#eef3fb]",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusBadge status={c.status} />
        <UrgencyBadge level={c.level} />
        <span className="ml-auto text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-base leading-snug font-semibold">{c.content || c.title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CategoryIcon category={c.category} className="size-3.5" />
        {CATEGORY_LABEL[c.category]}・{c.site}
      </p>
      {c.customer && <p className="text-xs text-muted-foreground">{c.customer}</p>}
      <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <Avatar name={assignee?.name} />
        {assignee?.name ?? "未割当"}
        {c.comments.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            <MessageSquare className="size-4" />
            {c.comments.length}
          </span>
        )}
      </div>
    </Link>
  );
}
