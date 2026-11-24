import type { OutboxItem } from "../_shared/notification-email.ts";

export function item(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: 42,
    to: "tanaka@example.com",
    attempts: 1,
    recipientName: "田中 一郎",
    isAssignee: false,
    event: "approval_requested",
    actorName: "鈴木 健",
    notifiedAt: "2026-11-24T09:42:00+09:00",
    message: "確認しました。釣銭トレーの運用を見直します。",
    claim: {
      id: "CL-20261124-031000-NQ9C",
      category: "cash",
      level: 2,
      status: "pending_approval",
      title: "レジ金過不足 / みなと中央店",
      content: "閉店時のレジ締めで1,000円不足。釣銭の渡し間違いの可能性。",
      site: "みなと中央店",
      amount: -1000,
      customer: "",
      assigneeName: "鈴木 健",
      reporterName: "佐藤 花子",
    },
    ...overrides,
  };
}
