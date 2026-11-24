// 表示用ラベル（src/lib/domain.ts と同じ値。tests/labels.test.ts で一致を確認している）
// Edge Function はアプリのコードを読み込めないため、ここに複製している

export const CATEGORY_LABEL: Record<string, string> = {
  incident: "インシデント/クレーム",
  vehicle: "車両関連",
  cash: "レジ金過不足",
  equipment: "備品紛失・破損",
};

export const URGENCY_LABEL: Record<number, string> = { 1: "低", 2: "中", 3: "高" };

export const STATUS_LABEL: Record<string, string> = {
  received: "受付",
  in_progress: "対応中",
  pending_approval: "承認待ち",
  done: "完了",
  returned: "差し戻し",
};

export const NOTIFICATION_EVENT_LABEL: Record<string, string> = {
  created: "新規報告",
  approval_requested: "承認依頼",
  approved: "承認",
  returned: "差し戻し",
};
