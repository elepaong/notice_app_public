"use client";

import Link from "next/link";
import { Mail, MailCheck, MailMinus, MailWarning } from "lucide-react";
import { Card } from "@/components/claim-ui";
import {
  CATEGORY_LABEL,
  EMAIL_STATUS_LABEL,
  NOTIFICATION_EVENT_LABEL,
  ROLE_LABEL,
  URGENCY_LABEL,
  describeUser,
  type EmailStatus,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EMAIL_ICON: Record<EmailStatus, { icon: typeof Mail; className: string }> = {
  pending: { icon: Mail, className: "text-muted-foreground" },
  sending: { icon: Mail, className: "text-muted-foreground" },
  sent: { icon: MailCheck, className: "text-st-done" },
  failed: { icon: MailWarning, className: "text-urg-high" },
  skipped: { icon: MailMinus, className: "text-muted-foreground" },
};

export default function NotificationsPage() {
  const { mode, notifications, claims, users, userById } = useStore();

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-3 pt-3 pb-6 lg:pt-6">
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        通知ごとに、届いた社員（●）と届かなかった社員（○）を表示します。
        {mode === "demo" ? (
          <span className="block text-gold">テスト環境ではメールは送信されません。</span>
        ) : (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Legend status="sent" />
            <Legend status="pending" />
            <Legend status="failed" />
            <Legend status="skipped" />
          </span>
        )}
      </p>
      {notifications.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">まだ通知はありません</p>
      )}
      {notifications.map((n) => {
        const claim = claims.find((c) => c.id === n.claimId);
        if (!claim) return null;
        const mailed = Object.values(n.emails ?? {}).filter((e) => e.status === "sent").length;
        const failed = Object.values(n.emails ?? {}).filter((e) => e.status === "failed").length;
        return (
          <Card key={n.id} className="p-3.5">
            <Link href={`/claims/${claim.id}`} className="block hover:underline">
              <h2 className="text-base font-semibold">
                [{URGENCY_LABEL[claim.level]}] {NOTIFICATION_EVENT_LABEL[n.event]}・{CATEGORY_LABEL[claim.category]}
              </h2>
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {claim.id}・{userById(n.actorId)?.name}・{formatDateTime(n.createdAt)}
            </p>
            <p className="mt-1 text-xs font-semibold text-gold">
              {n.recipientIds.length} / {users.length - 1} 人に送信
              {mode === "supabase" && n.recipientIds.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  ・メール {mailed}通送信済み
                  {failed > 0 && <span className="font-semibold text-urg-high">・{failed}通失敗</span>}
                </span>
              )}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {users
                .filter((u) => u.id !== n.actorId)
                .map((u) => {
                  const sent = n.recipientIds.includes(u.id);
                  const email = n.emails?.[u.id];
                  const Icon = email ? EMAIL_ICON[email.status].icon : null;
                  return (
                    <li
                      key={u.id}
                      title={[
                        describeUser(u),
                        email && EMAIL_STATUS_LABEL[email.status],
                        email?.error,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px]",
                        sent ? "bg-accent text-foreground" : "bg-background text-muted-foreground line-through",
                      )}
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          sent ? "bg-navy" : "border border-muted-foreground bg-transparent",
                        )}
                      />
                      {u.name} {ROLE_LABEL[u.role]}
                      {Icon && email && (
                        <Icon
                          className={cn("size-3.5", EMAIL_ICON[email.status].className)}
                          aria-label={EMAIL_STATUS_LABEL[email.status]}
                        />
                      )}
                    </li>
                  );
                })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function Legend({ status }: { status: EmailStatus }) {
  const { icon: Icon, className } = EMAIL_ICON[status];
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn("size-3.5", className)} />
      {EMAIL_STATUS_LABEL[status]}
    </span>
  );
}
