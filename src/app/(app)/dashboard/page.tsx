"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  Card,
  CategoryIcon,
  Chip,
  STATUS_BAR_CLASS,
  StatusBadge,
  URGENCY_BAR_CLASS,
  UrgencyBadge,
} from "@/components/claim-ui";
import { CATEGORY_LABEL } from "@/lib/domain";
import { PERIODS, computeStats, fmtH, type Period } from "@/lib/stats";
import { useStore } from "@/lib/store";

export default function DashboardPage() {
  const { claims } = useStore();
  const [period, setPeriod] = useState<Period>("this_month");
  const s = useMemo(() => computeStats(claims, period), [claims, period]);

  const maxHours = Math.max(1, ...s.byCategory.map((c) => c.agg?.max ?? 0));
  const maxStatus = Math.max(1, ...s.byStatus.map((x) => x.count));
  const maxLevel = Math.max(1, ...s.byLevel.map((x) => x.agg?.avg ?? 0));

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 pt-4 pb-6 lg:px-6 lg:pt-6">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>
            {period === p.id && <Check className="size-4" />}
            {p.label}
          </Chip>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        対応時間＝登録から完了まで。期間内に完了した{s.completed}件が対象です。
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="総件数" value={String(s.total)} unit="件" sub={`完了 ${s.completed}・未完了 ${s.open}`} />
        <Stat
          label="平均対応時間"
          value={s.overall ? fmtH(s.overall.avg) : "—"}
          unit="h"
          sub={`完了 ${s.completed}件の平均`}
        />
        <Stat
          label="最短"
          value={s.overall ? fmtH(s.overall.min) : "—"}
          unit="h"
          sub={s.fastest ? CATEGORY_LABEL[s.fastest.category] : "—"}
        />
        <Stat
          label="最長"
          value={s.overall ? fmtH(s.overall.max) : "—"}
          unit="h"
          sub={s.slowest ? CATEGORY_LABEL[s.slowest.category] : "—"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card className="p-4">
          <h2 className="text-base font-semibold">種類別 対応時間</h2>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-navy" />
              平均
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-[#b8c2d3]" />
              最短〜最長
            </span>
          </div>
          <ul className="mt-4 space-y-5">
            {s.byCategory.map(({ category, total, agg }) => (
              <li key={category}>
                <div className="flex items-center gap-2">
                  <CategoryIcon category={category} className="size-4" />
                  <span className="text-[15px] font-medium">{CATEGORY_LABEL[category]}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{total}件</span>
                </div>
                <div className="relative mt-2.5 h-2 rounded-full bg-background">
                  {agg && (
                    <>
                      <div
                        className="absolute inset-y-0 rounded-full bg-[#b8c2d3]"
                        style={{
                          left: `${(agg.min / maxHours) * 100}%`,
                          width: `${Math.max(1, ((agg.max - agg.min) / maxHours) * 100)}%`,
                        }}
                      />
                      <div
                        className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-navy"
                        style={{ left: `${(agg.avg / maxHours) * 100}%` }}
                      />
                    </>
                  )}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>
                    最短 <b className="text-sm text-foreground">{agg ? `${fmtH(agg.min)}h` : "—"}</b>
                  </span>
                  <span>
                    平均 <b className="text-sm text-foreground">{agg ? `${fmtH(agg.avg)}h` : "—"}</b>
                  </span>
                  <span>
                    最長 <b className="text-sm text-foreground">{agg ? `${fmtH(agg.max)}h` : "—"}</b>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <h2 className="text-base font-semibold">ステータス別 件数</h2>
            <ul className="mt-4 space-y-3">
              {s.byStatus.map(({ status, count }) => (
                <li key={status} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3">
                  <StatusBadge status={status} className="justify-self-start" />
                  <Bar ratio={count / maxStatus} className={STATUS_BAR_CLASS[status]} />
                  <span className="text-right text-[15px] font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <h2 className="text-base font-semibold">緊急度別 平均対応時間</h2>
            <ul className="mt-4 space-y-3">
              {s.byLevel.map(({ level, agg }) => (
                <li key={level} className="grid grid-cols-[6rem_1fr_3.5rem] items-center gap-3">
                  <UrgencyBadge level={level} />
                  <Bar ratio={(agg?.avg ?? 0) / maxLevel} className={URGENCY_BAR_CLASS[level]} />
                  <span className="text-right text-[15px] font-semibold">{agg ? `${fmtH(agg.avg)}h` : "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2">
        <span className="text-2xl font-semibold">{value}</span>
        <span className="ml-1 text-sm text-muted-foreground">{unit}</span>
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

function Bar({ ratio, className }: { ratio: number; className: string }) {
  return (
    <div className="h-2 rounded-full bg-background">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(ratio > 0 ? 3 : 0, ratio * 100)}%` }} />
    </div>
  );
}
