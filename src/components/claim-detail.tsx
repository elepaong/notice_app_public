"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  FileText,
  Hourglass,
  ImagePlus,
  Images,
  MessagesSquare,
  SendHorizontal,
  Undo2,
  UserPlus,
} from "lucide-react";
import {
  CATEGORY_LABEL,
  approversFor,
  canApprove,
  describeApprovers,
  type ApprovalEvent,
  type Claim,
} from "@/lib/domain";
import { formatDate, formatDateTime, formatYen } from "@/lib/format";
import { fileToDataUrl } from "@/lib/image";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Avatar, CategoryIcon, Section, StatusBadge, UrgencyBadge } from "./claim-ui";

export function ClaimDetail({ claim: c }: { claim: Claim }) {
  const { userById, users } = useStore();

  const rows: [string, React.ReactNode][] = [
    ["現場", c.site],
    ...(c.customer ? ([["顧客", c.customer]] as [string, string][]) : []),
    ["責任者（店長）", c.responsiblePerson || "—"],
    ["担当者", userById(c.assigneeId)?.name ?? "未割当"],
    ...(c.amount !== null ? ([["過不足金額（円）", formatYen(c.amount)]] as [string, string][]) : []),
    ["承認者", describeApprovers(c, users)],
    ["登録者", userById(c.reporterId)?.name ?? "—"],
    ["発生日", formatDate(c.occurredOn)],
    ["登録日時", formatDateTime(c.createdAt)],
    ["更新日時", formatDateTime(c.updatedAt)],
  ];

  return (
    <div className="mx-auto max-w-4xl pb-[calc(2.5rem+var(--safe-bottom))]">
      <div className="grid gap-3 px-4 pt-4 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        <UrgencyBadge level={c.level} />
        <span className="inline-flex h-7 items-center gap-2 rounded-full bg-chip px-3 text-sm">
          <CategoryIcon category={c.category} className="size-4" />
          {CATEGORY_LABEL[c.category]}
        </span>
      </div>
      <div>
        <h2 className="text-[22px] leading-tight font-semibold">{c.title}</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{c.id}</p>
      </div>
      </div>

      <div className="px-4 pb-4 empty:hidden">
        <ActionPanel claim={c} />
      </div>

      <Section>
        <SectionTitle icon={FileText}>経緯・内容</SectionTitle>
        <p className="mt-2 text-base leading-relaxed whitespace-pre-wrap">{c.content}</p>
        <hr className="my-4" />
        <dl className="space-y-5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <PhotosCard claim={c} />

      <Section>
        <SectionTitle icon={CircleCheck}>承認履歴</SectionTitle>
        {c.approvals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">まだ承認依頼はありません</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {c.approvals.map((a, i) => (
              <HistoryItem key={i} event={a} isLatest={i === c.approvals.length - 1} status={c.status} />
            ))}
          </ul>
        )}
      </Section>

      <CommentsCard claim={c} />
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5" />
      <h3 className="text-base font-semibold">{children}</h3>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** 非同期操作：二重送信を防ぎ、失敗したら知らせる */
function useRunner() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function ActionPanel({ claim: c }: { claim: Claim }) {
  const store = useStore();
  const { me, users, userById } = store;
  const [message, setMessage] = useState("");
  const [returning, setReturning] = useState(false);
  const { busy, run } = useRunner();
  if (!me) return null;

  const approvers = approversFor(c, users);
  const lastRequest = [...c.approvals].reverse().find((a) => a.action === "requested");
  const lastReturn = [...c.approvals].reverse().find((a) => a.action === "returned");
  const lastApproval = [...c.approvals].reverse().find((a) => a.action === "approved");
  const isAssignee = c.assigneeId === me.id;

  if (c.status === "pending_approval") {
    const mayApprove = canApprove(me, c, users);
    return (
      <Panel tone="pending">
        <p className="flex items-center gap-2 font-semibold text-st-pending">
          <Hourglass className="size-4" />
          {approvers.map((u) => u.name).join("、")} さんの承認待ちです
        </p>
        {lastRequest?.message && (
          <p className="mt-2 text-sm">
            「{lastRequest.message}」— {userById(lastRequest.fromId)?.name}
          </p>
        )}
        {mayApprove &&
          (returning ? (
            <div className="mt-3 space-y-2">
              <textarea
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="差し戻しの理由を入力"
                className="min-h-20 w-full rounded-lg bg-card p-3 text-base outline-none focus:ring-2 focus:ring-ring/40"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={!message.trim() || busy}
                  onClick={async () => {
                    if (await run(() => store.returnClaim(c.id, message))) {
                      setMessage("");
                      setReturning(false);
                    }
                  }}
                >
                  <Undo2 />
                  差し戻す
                </Button>
                <Button variant="ghost" onClick={() => setReturning(false)}>
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                variant="approve"
                className="w-28"
                disabled={busy}
                onClick={() => run(() => store.approve(c.id, ""))}
              >
                <Check />
                承認
              </Button>
              <Button variant="destructive" className="w-28" onClick={() => setReturning(true)}>
                <Undo2 />
                差し戻し
              </Button>
            </div>
          ))}
      </Panel>
    );
  }

  if (c.status === "done") {
    return (
      <Panel tone="done">
        <p className="flex items-center gap-2 font-semibold text-st-done">
          <CircleCheck className="size-4" />
          {userById(lastApproval?.fromId)?.name ?? "承認者"} さんが承認しました（完了）
        </p>
        {c.completedAt && <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(c.completedAt)}</p>}
      </Panel>
    );
  }

  if (!c.assigneeId) {
    return (
      <Panel tone="neutral">
        <p className="text-sm font-semibold">担当者が未割当です</p>
        <Button className="mt-3" disabled={busy} onClick={() => run(() => store.assignToMe(c.id))}>
          <UserPlus />
          自分が担当する
        </Button>
      </Panel>
    );
  }

  // 対応中 / 差し戻し
  return (
    <Panel tone={c.status === "returned" ? "returned" : "neutral"}>
      {c.status === "returned" && lastReturn && (
        <p className="mb-2 text-sm">
          <span className="font-semibold text-st-returned">差し戻されました</span>：「{lastReturn.message}」—{" "}
          {userById(lastReturn.fromId)?.name}
        </p>
      )}
      {isAssignee ? (
        <>
          <p className="text-sm font-semibold">
            対応が終わったら、{approvers.map((u) => u.name).join("、")} さんに承認を依頼してください
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="対応内容・報告（例：確認しました。釣銭トレーの運用を見直します。）"
            className="mt-2 min-h-20 w-full rounded-lg bg-card p-3 text-base outline-none focus:ring-2 focus:ring-ring/40"
          />
          <Button
            className="mt-2"
            disabled={!message.trim() || busy}
            onClick={async () => {
              if (await run(() => store.requestApproval(c.id, message))) setMessage("");
            }}
          >
            <SendHorizontal />
            承認依頼
          </Button>
        </>
      ) : (
        <p className="text-sm">
          <span className="font-semibold">{userById(c.assigneeId)?.name}</span> さんが対応中です
        </p>
      )}
    </Panel>
  );
}

function Panel({
  tone,
  children,
}: {
  tone: "pending" | "done" | "returned" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        tone === "pending" && "bg-st-pending-bg",
        tone === "done" && "bg-st-done-bg",
        tone === "returned" && "bg-st-returned-bg",
        tone === "neutral" && "bg-accent/60",
      )}
    >
      {children}
    </div>
  );
}

function HistoryItem({ event: a, isLatest, status }: { event: ApprovalEvent; isLatest: boolean; status: Claim["status"] }) {
  const { userById } = useStore();
  const from = userById(a.fromId)?.name;
  const to = a.toIds?.map((id) => userById(id)?.name).join("、");
  const label =
    a.action === "requested"
      ? isLatest && status === "pending_approval"
        ? "承認待ち"
        : "承認依頼"
      : a.action === "approved"
        ? "承認"
        : "差し戻し";
  const Icon = a.action === "requested" ? Hourglass : a.action === "approved" ? CircleCheck : Undo2;
  const color =
    a.action === "requested" ? "text-st-pending" : a.action === "approved" ? "text-st-done" : "text-st-returned";
  return (
    <li className="flex gap-2">
      <Icon className={cn("mt-0.5 size-5 shrink-0", color)} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1 text-[15px] font-semibold">
          {from}
          {to && (
            <>
              <ArrowRight className="size-4" />
              {to}
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(a.at)}・{label}
        </p>
        {a.message && a.action !== "requested" && <p className="mt-1 text-sm">「{a.message}」</p>}
      </div>
    </li>
  );
}

function PhotosCard({ claim: c }: { claim: Claim }) {
  const { addPhotos } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const { busy, run } = useRunner();
  return (
    <Section>
      <SectionTitle
        icon={Images}
        action={
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold"
          >
            <ImagePlus className="size-5" />
            {busy ? "アップロード中…" : "写真を追加"}
          </button>
        }
      >
        写真
      </SectionTitle>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          await run(async () => addPhotos(c.id, await Promise.all(files.map((f) => fileToDataUrl(f)))));
        }}
      />
      {c.photos.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">写真はまだありません</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {c.photos.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`写真 ${i + 1}`} className="size-24 rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}
    </Section>
  );
}

function CommentsCard({ claim: c }: { claim: Claim }) {
  const { userById, addComment } = useStore();
  const [text, setText] = useState("");
  const { busy, run } = useRunner();
  const submit = async () => {
    if (!text.trim()) return;
    if (await run(() => addComment(c.id, text))) setText("");
  };
  return (
    <Section>
      <SectionTitle icon={MessagesSquare}>コメント ({c.comments.length})</SectionTitle>
      <ul className="mt-3 space-y-3">
        {c.comments.map((m, i) => {
          const u = userById(m.userId);
          return (
            <li key={i} className="flex gap-2">
              <Avatar name={u?.name} className="mt-0.5 size-6 text-xs" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {u?.name}・{formatDateTime(m.at)}
                </p>
                <p className="text-[15px] whitespace-pre-wrap">{m.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-4 flex h-11 items-center rounded-lg bg-sunken pr-2 pl-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="コメントを入力"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <button type="submit" aria-label="送信" disabled={!text.trim() || busy} className="cursor-pointer p-1 disabled:opacity-40">
          <SendHorizontal className="size-6 text-navy" />
        </button>
      </form>
    </Section>
  );
}
