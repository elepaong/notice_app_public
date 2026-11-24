/**
 * ドメイン定義：役職・承認レベル・ステータス・通知ルール
 * DB（supabase/migrations）と同じ値を使うこと。
 */

// ───────── 役職 ─────────
export const ROLES = ["president", "admin", "branch_manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  president: "社長",
  admin: "管理者",
  branch_manager: "支店管理者",
  staff: "一般社員",
};

/** 役職の序列（大きいほど上位） */
export const ROLE_RANK: Record<Role, number> = {
  staff: 0,
  branch_manager: 1,
  admin: 2,
  president: 3,
};

// ───────── 承認レベル（= 緊急度） ─────────
export type Level = 1 | 2 | 3;

export const URGENCY_LABEL: Record<Level, string> = { 1: "低", 2: "中", 3: "高" };

/** レベルごとの承認者（確認者）の役職 */
export const APPROVER_ROLE_BY_LEVEL: Record<Level, Role> = {
  1: "branch_manager",
  2: "admin",
  3: "president",
};

/** その役職が承認を担当するレベル（なければ null） */
export function approvalLevelOf(role: Role): Level | null {
  const entry = (Object.entries(APPROVER_ROLE_BY_LEVEL) as [string, Role][]).find(
    ([, r]) => r === role,
  );
  return entry ? (Number(entry[0]) as Level) : null;
}

// ───────── 報告の種類 ─────────
export const CATEGORIES = ["incident", "vehicle", "cash", "equipment"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  incident: "インシデント/クレーム",
  vehicle: "車両関連",
  cash: "レジ金過不足",
  equipment: "備品紛失・破損",
};

/** 種類ごとの緊急度（= 承認レベル）。種類で自動的に決まる */
export const CATEGORY_LEVEL: Record<Category, Level> = {
  incident: 3,
  vehicle: 3,
  cash: 2,
  equipment: 1,
};

// ───────── ステータス ─────────
export const STATUSES = ["received", "in_progress", "pending_approval", "done", "returned"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  received: "受付",
  in_progress: "対応中",
  pending_approval: "承認待ち",
  done: "完了",
  returned: "差し戻し",
};

// ───────── エンティティ ─────────
export type User = {
  id: string;
  name: string;
  role: Role;
  branch: string;
  /** 会社の Google アカウント（本番）／テスト用アドレス（テスト環境） */
  email?: string;
  /** 支店管理者が担当する現場（複数可） */
  managedSites?: string[];
};

/** 現場名の比較用（空白・全角半角・大文字小文字を無視）。DB の normalize_site と同じ規則 */
export function normalizeSite(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 社員の補足表示：「拠点・役職」、支店管理者は担当現場 */
export function describeUser(u: User): string {
  if (u.role === "branch_manager") {
    const sites = u.managedSites ?? [];
    return sites.length > 0
      ? `${ROLE_LABEL[u.role]}・担当 ${sites.length}現場（${sites.join("、")}）`
      : `${ROLE_LABEL[u.role]}・担当現場なし`;
  }
  return `${u.branch || "拠点未設定"}・${ROLE_LABEL[u.role]}`;
}

/** 支店管理者がこの現場を担当しているか */
export function managesSite(user: User, site: string): boolean {
  const key = normalizeSite(site);
  return (user.managedSites ?? []).some((s) => normalizeSite(s) === key);
}

export type ApprovalEvent = {
  action: "requested" | "approved" | "returned";
  fromId: string;
  /** 承認依頼の宛先（requested のときのみ） */
  toIds?: string[];
  message: string;
  at: string;
};

export type Comment = { userId: string; text: string; at: string };

export type Claim = {
  id: string;
  category: Category;
  level: Level;
  status: Status;
  title: string;
  content: string;
  site: string;
  responsiblePerson: string;
  customer: string;
  assigneeId: string | null;
  reporterId: string;
  amount: number | null;
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  photos: string[];
  approvals: ApprovalEvent[];
  comments: Comment[];
};

export type NotificationEvent = "created" | "approval_requested" | "approved" | "returned";

export const NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, string> = {
  created: "新規報告",
  approval_requested: "承認依頼",
  approved: "承認",
  returned: "差し戻し",
};

export type EmailStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pending: "メール送信待ち",
  sending: "メール送信中",
  sent: "メール送信済み",
  failed: "メール送信失敗",
  skipped: "メール送信なし",
};

export type Notification = {
  id: string;
  claimId: string;
  event: NotificationEvent;
  actorId: string;
  recipientIds: string[];
  readByIds: string[];
  createdAt: string;
  /** 届け先ごとのメール送信状況（本番のみ） */
  emails?: Record<string, { status: EmailStatus; error?: string }>;
};

// ───────── 承認者・通知先の決定 ─────────

/**
 * クレームの承認者。
 * Lv.1 はその現場を担当する支店管理者（現場名で照合）。担当者がいなければ管理者が代わりに承認する。
 */
export function approversFor(claim: Pick<Claim, "level" | "site">, users: User[]): User[] {
  const role = APPROVER_ROLE_BY_LEVEL[claim.level];
  if (role === "branch_manager") {
    const local = users.filter((u) => u.role === role && managesSite(u, claim.site));
    if (local.length > 0) return local;
    return users.filter((u) => u.role === "admin");
  }
  return users.filter((u) => u.role === role);
}

/**
 * 承認者の表示用テキスト。
 * 例：「Lv.1 支店管理者（鈴木 健）」／代行時「Lv.1 支店管理者不在のため 管理者（田中 一郎）」
 */
export function describeApprovers(claim: Pick<Claim, "level" | "site">, users: User[]): string {
  const role = APPROVER_ROLE_BY_LEVEL[claim.level];
  const approvers = approversFor(claim, users);
  const names = approvers.map((u) => u.name).join("、") || "—";
  const actualRole = approvers[0]?.role;
  if (actualRole && actualRole !== role) {
    return `Lv.${claim.level} ${ROLE_LABEL[role]}不在のため ${ROLE_LABEL[actualRole]}（${names}）`;
  }
  return `Lv.${claim.level} ${ROLE_LABEL[role]}（${names}）`;
}

/** 承認・差し戻しできるか：指定の承認者、またはそれより上位の役職 */
export function canApprove(user: User, claim: Claim, users: User[]): boolean {
  if (claim.status !== "pending_approval") return false;
  if (approversFor(claim, users).some((u) => u.id === user.id)) return true;
  return ROLE_RANK[user.role] > ROLE_RANK[APPROVER_ROLE_BY_LEVEL[claim.level]];
}

/**
 * 通知先ルール。ここを変えれば通知の届き方が変わる。
 * - 新規報告：そのレベルの承認者 ＋ 担当者
 * - 承認依頼：そのレベルの承認者
 * - 承認／差し戻し：担当者 ＋ 登録者
 * いずれも操作した本人は除く。
 */
export function recipientsFor(
  event: NotificationEvent,
  claim: Claim,
  actorId: string,
  users: User[],
): string[] {
  const ids = new Set<string>();
  const approvers = approversFor(claim, users).map((u) => u.id);
  switch (event) {
    case "created":
      approvers.forEach((id) => ids.add(id));
      if (claim.assigneeId) ids.add(claim.assigneeId);
      break;
    case "approval_requested":
      approvers.forEach((id) => ids.add(id));
      break;
    case "approved":
    case "returned":
      if (claim.assigneeId) ids.add(claim.assigneeId);
      ids.add(claim.reporterId);
      break;
  }
  ids.delete(actorId);
  return [...ids];
}
