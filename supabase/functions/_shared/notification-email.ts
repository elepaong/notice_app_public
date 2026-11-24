// 通知メールの件名・本文を作る（Deno / Node どちらでも動く純粋な関数）

import { CATEGORY_LABEL, NOTIFICATION_EVENT_LABEL, STATUS_LABEL, URGENCY_LABEL } from "./labels.ts";

/** claim_email_batch() が返す1件分 */
export type OutboxItem = {
  id: number;
  to: string;
  attempts: number;
  recipientName: string;
  isAssignee: boolean;
  event: "created" | "approval_requested" | "approved" | "returned";
  actorName: string;
  notifiedAt: string;
  message: string | null;
  claim: {
    id: string;
    category: string;
    level: number;
    status: string;
    title: string;
    content: string;
    site: string;
    amount: number | null;
    customer: string;
    assigneeName: string | null;
    reporterName: string;
  };
};

export type EmailContent = { subject: string; text: string; html: string };

const URGENCY_COLOR: Record<number, string> = { 1: "#388E3C", 2: "#F57C00", 3: "#D32F2F" };

function lead(item: OutboxItem): string {
  const actor = `${item.actorName} さん`;
  switch (item.event) {
    case "created":
      return item.isAssignee
        ? `${actor}が新しい報告を登録し、あなたが担当者に設定されました。対応をお願いします。`
        : `${actor}が新しい報告を登録しました。あなたはこの報告の承認者です。`;
    case "approval_requested":
      return `${actor}から承認依頼が届きました。内容を確認して、承認または差し戻しをしてください。`;
    case "approved":
      return `${actor}が承認しました。この報告は完了です。`;
    case "returned":
      return `${actor}が差し戻しました。内容を確認して、もう一度承認依頼をしてください。`;
  }
}

function messageLabel(event: OutboxItem["event"]): string {
  return event === "returned" ? "差し戻しの理由" : event === "approved" ? "承認者のコメント" : "担当者からの報告";
}

function formatYen(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("ja-JP")}円`;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function claimUrl(appUrl: string, claimId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/claims/${encodeURIComponent(claimId)}`;
}

export function composeEmail(item: OutboxItem, appUrl: string): EmailContent {
  const c = item.claim;
  const urgency = URGENCY_LABEL[c.level] ?? String(c.level);
  const eventLabel = NOTIFICATION_EVENT_LABEL[item.event] ?? item.event;
  const subject = `【クレーム管理】${eventLabel}：${c.title}（緊急度 ${urgency}）`;
  const url = claimUrl(appUrl, c.id);

  const rows: [string, string][] = [
    ["種類", CATEGORY_LABEL[c.category] ?? c.category],
    ["緊急度", urgency],
    ["ステータス", STATUS_LABEL[c.status] ?? c.status],
    ["現場", c.site],
    ...(c.customer ? ([["顧客", c.customer]] as [string, string][]) : []),
    ["担当者", c.assigneeName ?? "未割当"],
    ["登録者", c.reporterName],
    ...(c.amount !== null ? ([["過不足金額", formatYen(c.amount)]] as [string, string][]) : []),
    ["受付番号", c.id],
  ];
  const content = truncate(c.content, 400);
  const message = item.message?.trim() || null;

  const text = [
    `${item.recipientName} さん`,
    "",
    lead(item),
    "",
    ...(message ? [`■ ${messageLabel(item.event)}`, message, ""] : []),
    `■ ${c.title}`,
    content,
    "",
    ...rows.map(([k, v]) => `${k}：${v}`),
    "",
    `▼ 詳細を開く`,
    url,
    "",
    "――",
    "クレーム管理システム（このメールは送信専用です）",
    "メール通知を止めたい場合は管理者に連絡してください。",
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F5F8;font-family:'Hiragino Sans','Noto Sans JP','Yu Gothic',Meiryo,sans-serif;color:#1B2030;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
  <tr><td style="background:#14284B;padding:16px 24px;">
    <span style="color:#B8912F;font-weight:700;letter-spacing:1px;">SAMPLE CO.</span>
    <span style="color:#FFFFFF;font-weight:700;margin-left:8px;">クレーム管理</span>
  </td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 4px;font-size:14px;">${e(item.recipientName)} さん</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">${e(lead(item))}</p>
    ${
      message
        ? `<div style="background:#EDE7F6;border-radius:10px;padding:12px 16px;margin:0 0 20px;">
      <div style="font-size:12px;color:#4527A0;font-weight:700;margin-bottom:4px;">${e(messageLabel(item.event))}</div>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${e(message)}</div>
    </div>`
        : ""
    }
    <div style="font-size:12px;font-weight:700;color:${URGENCY_COLOR[c.level] ?? "#5F6675"};margin-bottom:4px;">緊急度 ${e(urgency)}・${e(STATUS_LABEL[c.status] ?? c.status)}</div>
    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${e(c.title)}</div>
    <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;margin-bottom:16px;">${e(content)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-top:1px solid #E3E6EC;">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#5F6675;width:96px;vertical-align:top;border-bottom:1px solid #E3E6EC;">${e(k)}</td><td style="padding:8px 0;border-bottom:1px solid #E3E6EC;">${e(v)}</td></tr>`,
        )
        .join("\n      ")}
    </table>
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${e(url)}" style="display:inline-block;background:#14284B;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:10px;">詳細を開く</a>
    </div>
  </td></tr>
  <tr><td style="padding:16px 24px;background:#F4F5F8;font-size:11px;color:#5F6675;line-height:1.6;">
    このメールは送信専用です。返信はできません。<br>メール通知を止めたい場合は管理者に連絡してください。
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
