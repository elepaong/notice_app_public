import {
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_LEVEL,
  approversFor,
  managesSite,
  recipientsFor,
  type Category,
  type Claim,
  type Notification,
  type User,
} from "./domain";
import { claimId } from "./format";

import { HEAD_OFFICE, SITE_NAMES } from "./sites";

/** 現場として選べる拠点 */
export const SITES: readonly string[] = SITE_NAMES;

export const DEMO_USERS: User[] = [
  { id: "u-sato", name: "佐藤 花子", role: "staff", branch: "みなと中央店", email: "sato@example.com" },
  { id: "u-kim", name: "金 民準", role: "staff", branch: "つばき店", email: "kim@example.com" },
  {
    id: "u-suzuki",
    name: "鈴木 健",
    role: "branch_manager",
    branch: "みなと中央店",
    email: "suzuki@example.com",
    managedSites: ["みなと中央店", "みなと南店", "しおかぜ店", "あおば店"],
  },
  {
    id: "u-takahashi",
    name: "高橋 美咲",
    role: "branch_manager",
    branch: "さくら台店",
    email: "takahashi@example.com",
    managedSites: ["さくら台店", "ひばり店", "かえで店"],
  },
  {
    id: "u-watanabe",
    name: "渡辺 翔",
    role: "branch_manager",
    branch: "つばき店",
    email: "watanabe@example.com",
    managedSites: ["つばき店", "すずらん店", "ひまわり店", "しおかぜ店"],
  },
  {
    id: "u-kobayashi",
    name: "小林 舞",
    role: "branch_manager",
    branch: "あさひ店",
    email: "kobayashi@example.com",
    managedSites: ["あさひ店", "ゆうひ店", "みどり店"],
  },
  { id: "u-tanaka", name: "田中 一郎", role: "admin", branch: HEAD_OFFICE, email: "tanaka@example.com" },
  { id: "u-ito", name: "伊藤 誠", role: "president", branch: HEAD_OFFICE, email: "ito@example.com" },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_TEXT: Record<Category, string[]> = {
  incident: [
    "ブランドバッグの査定額への苦情",
    "電話対応の言葉遣いについてご指摘",
    "買取金額の振込遅延についての問い合わせ",
    "待ち時間が長いとのご意見",
  ],
  vehicle: [
    "集荷先の駐車場で後退時に支柱に接触。",
    "社用車のタイヤがパンク。",
    "配送中に車両の警告灯が点灯。",
  ],
  cash: [
    "閉店時のレジ締めで1,000円不足。釣銭の渡し間違いの可能性。",
    "レジ締めで500円過剰。",
    "両替金の数え間違い。",
  ],
  equipment: [
    "カウンターから落下し画面が割れた。",
    "査定用ルーペの紛失。",
    "店頭ディスプレイの破損。",
  ],
};

const HOURS = 3600_000;

type Seed = { claims: Claim[]; notifications: Notification[] };

export function createSeed(now = new Date()): Seed {
  const rand = mulberry32(20261026);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const users = DEMO_USERS;
  const staffLike = users.filter((u) => u.role === "staff" || u.role === "branch_manager");
  const claims: Claim[] = [];
  const notifications: Notification[] = [];

  // 過去 120 日分の完了済みデータ（ダッシュボード用）
  for (let i = 0; i < 64; i++) {
    const category = pick(CATEGORIES);
    const level = CATEGORY_LEVEL[category];
    const created = new Date(now.getTime() - (2 + rand() * 118) * 24 * HOURS);
    // 半分は支店管理者の担当現場、残りは全現場から（担当者がいない現場は管理者が承認）
    const managed = users.flatMap((u) => u.managedSites ?? []);
    const site = rand() < 0.5 ? pick(managed) : pick(SITE_NAMES);
    const reporter = pick(staffLike);
    const local = users.find((u) => u.role === "branch_manager" && managesSite(u, site));
    const assignee = local ?? pick(staffLike);
    const base = { incident: 26, vehicle: 41, cash: 8, equipment: 12 }[category];
    const hours = Math.max(0.5, Math.round(base * (0.2 + rand() * 1.8) * 2) / 2);
    const completed = new Date(created.getTime() + hours * HOURS);
    const isDone = completed < now && rand() > 0.12;
    const status = isDone ? "done" : pick(["received", "in_progress", "pending_approval"] as const);
    const approver = approversFor({ level, site }, users)[0];
    const content = pick(SAMPLE_TEXT[category]);
    claims.push({
      id: claimId(created, rand),
      category,
      level,
      status,
      title: `${CATEGORY_LABEL[category]} / ${site}`,
      content,
      site,
      responsiblePerson: "",
      customer: category === "incident" ? "個人のお客様" : "",
      assigneeId: status === "received" ? null : assignee.id,
      reporterId: reporter.id,
      amount: category === "cash" ? pick([-1000, -500, 500, -2000]) : null,
      occurredOn: created.toISOString(),
      createdAt: created.toISOString(),
      updatedAt: (isDone ? completed : created).toISOString(),
      completedAt: isDone ? completed.toISOString() : null,
      photos: [],
      approvals: isDone
        ? [
            {
              action: "requested",
              fromId: assignee.id,
              toIds: [approver.id],
              message: "対応完了しました。",
              at: new Date(completed.getTime() - 0.25 * HOURS).toISOString(),
            },
            { action: "approved", fromId: approver.id, message: "", at: completed.toISOString() },
          ]
        : [],
      comments: [],
    });
  }

  // 一覧の先頭に出る、デザインと同じサンプル
  /** 現在から h 時間前（サンプルが未来の時刻にならないように） */
  const ago = (h: number) => new Date(now.getTime() - h * HOURS);
  const showcase: Claim[] = [
    {
      ...blank(ago(0.6), rand),
      category: "equipment",
      level: 1,
      status: "received",
      title: "カウンターから落下し画面が割れた。",
      content: "カウンターから落下し画面が割れた。",
      site: "あさひ店",
      reporterId: "u-kim",
    },
    {
      ...blank(ago(1.8), rand),
      category: "vehicle",
      level: 3,
      status: "received",
      title: "集荷先の駐車場で後退時に支柱に接触。",
      content: "集荷先の駐車場で後退時に支柱に接触。バンパー右側に擦り傷あり。",
      site: "さくら台店",
      assigneeId: "u-takahashi",
      reporterId: "u-takahashi",
    },
    {
      ...blank(ago(9), rand),
      category: "cash",
      level: 2,
      status: "pending_approval",
      title: "レジ金過不足 / みなと中央店",
      content: "閉店時のレジ締めで1,000円不足。釣銭の渡し間違いの可能性。",
      site: "みなと中央店",
      responsiblePerson: "山田",
      assigneeId: "u-suzuki",
      reporterId: "u-sato",
      amount: -1000,
      updatedAt: ago(2.5).toISOString(),
      approvals: [
        {
          action: "requested",
          fromId: "u-suzuki",
          toIds: ["u-tanaka"],
          message: "確認しました。釣銭トレーの運用を見直します。",
          at: ago(2.5).toISOString(),
        },
      ],
      comments: [
        {
          userId: "u-suzuki",
          text: "防犯カメラを確認しました。17:40頃のお釣りの渡し間違いと思われます。",
          at: ago(2.7).toISOString(),
        },
      ],
    },
    {
      ...blank(ago(11), rand),
      category: "incident",
      level: 3,
      status: "in_progress",
      title: "ブランドバッグの査定額への苦情",
      content: "ブランドバッグの査定額が他店より低いとのご指摘。再査定を希望されている。",
      site: "つばき店",
      customer: "個人のお客様",
      assigneeId: "u-tanaka",
      reporterId: "u-kim",
      comments: [
        { userId: "u-kim", text: "お客様は明日再来店予定です。", at: ago(10.2).toISOString() },
        { userId: "u-tanaka", text: "再査定は私が対応します。", at: ago(9.8).toISOString() },
      ],
    },
  ];
  claims.push(...showcase);

  for (const c of showcase) {
    notifications.push({
      id: `n-${c.id}`,
      claimId: c.id,
      event: "created",
      actorId: c.reporterId,
      recipientIds: recipientsFor("created", c, c.reporterId, users),
      readByIds: [],
      createdAt: c.createdAt,
    });
    if (c.status === "pending_approval") {
      const req = c.approvals[0];
      notifications.push({
        id: `n-${c.id}-req`,
        claimId: c.id,
        event: "approval_requested",
        actorId: req.fromId,
        recipientIds: recipientsFor("approval_requested", c, req.fromId, users),
        readByIds: [],
        createdAt: req.at,
      });
    }
  }

  claims.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { claims, notifications };
}

function blank(created: Date, rand: () => number): Claim {
  return {
    id: claimId(created, rand),
    category: "incident",
    level: 3,
    status: "received",
    title: "",
    content: "",
    site: "",
    responsiblePerson: "",
    customer: "",
    assigneeId: null,
    reporterId: "",
    amount: null,
    occurredOn: created.toISOString(),
    createdAt: created.toISOString(),
    updatedAt: created.toISOString(),
    completedAt: null,
    photos: [],
    approvals: [],
    comments: [],
  };
}
