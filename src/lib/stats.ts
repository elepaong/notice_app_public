import { CATEGORIES, STATUSES, type Category, type Claim, type Level, type Status } from "./domain";

export const PERIODS = [
  { id: "this_month", label: "今月" },
  { id: "last_month", label: "先月" },
  { id: "90d", label: "過去90日" },
  { id: "all", label: "全期間" },
] as const;
export type Period = (typeof PERIODS)[number]["id"];

function range(period: Period, now: Date): [Date, Date] {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "this_month":
      return [new Date(y, m, 1), new Date(y, m + 1, 1)];
    case "last_month":
      return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    case "90d":
      return [new Date(now.getTime() - 90 * 86400_000), new Date(now.getTime() + 1)];
    case "all":
      return [new Date(0), new Date(8.64e15)];
  }
}

export type Agg = { count: number; min: number; avg: number; max: number };

function agg(hours: number[]): Agg | null {
  if (hours.length === 0) return null;
  return {
    count: hours.length,
    min: Math.min(...hours),
    max: Math.max(...hours),
    avg: hours.reduce((a, b) => a + b, 0) / hours.length,
  };
}

/** 対応時間（時間）＝登録から完了まで */
const hoursOf = (c: Claim) => (new Date(c.completedAt!).getTime() - new Date(c.createdAt).getTime()) / 3600_000;

export function computeStats(claims: Claim[], period: Period, now = new Date()) {
  const [from, to] = range(period, now);
  const inPeriod = claims.filter((c) => {
    const t = new Date(c.createdAt);
    return t >= from && t < to;
  });
  const done = inPeriod.filter((c) => c.completedAt);
  const overall = agg(done.map(hoursOf));
  const fastest = done.length ? done.reduce((a, b) => (hoursOf(a) <= hoursOf(b) ? a : b)) : null;
  const slowest = done.length ? done.reduce((a, b) => (hoursOf(a) >= hoursOf(b) ? a : b)) : null;

  const byCategory = CATEGORIES.map((category: Category) => ({
    category,
    total: inPeriod.filter((c) => c.category === category).length,
    agg: agg(done.filter((c) => c.category === category).map(hoursOf)),
  }));

  const byStatus = STATUSES.map((status: Status) => ({
    status,
    count: inPeriod.filter((c) => c.status === status).length,
  }));

  const byLevel = ([3, 2, 1] as Level[]).map((level) => ({
    level,
    agg: agg(done.filter((c) => c.level === level).map(hoursOf)),
  }));

  return {
    total: inPeriod.length,
    completed: done.length,
    open: inPeriod.length - done.length,
    overall,
    fastest,
    slowest,
    byCategory,
    byStatus,
    byLevel,
  };
}

export const fmtH = (h: number) => `${h.toFixed(1)}`;
