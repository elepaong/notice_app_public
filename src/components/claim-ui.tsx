import {
  Calculator,
  MonitorSmartphone,
  TriangleAlert,
  Truck,
  User as UserIcon,
  type LucideProps,
} from "lucide-react";
import { STATUS_LABEL, URGENCY_LABEL, type Category, type Level, type Status } from "@/lib/domain";
import { initial } from "@/lib/format";
import { cn } from "@/lib/utils";

/** C：背景の塗りなし、点＋文字の色で表す */
const STATUS_CLASS: Record<Status, string> = {
  received: "text-st-received",
  in_progress: "text-st-progress",
  pending_approval: "text-st-pending",
  done: "text-st-done",
  returned: "text-st-returned",
};

export const STATUS_BAR_CLASS: Record<Status, string> = {
  received: "bg-navy",
  in_progress: "bg-st-progress",
  pending_approval: "bg-st-pending",
  done: "bg-st-done",
  returned: "bg-st-returned",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 text-xs font-semibold whitespace-nowrap",
        STATUS_CLASS[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const URGENCY_TEXT_CLASS: Record<Level, string> = {
  1: "text-urg-low",
  2: "text-urg-mid",
  3: "text-urg-high",
};

export const URGENCY_BAR_CLASS: Record<Level, string> = {
  1: "bg-urg-low",
  2: "bg-urg-mid",
  3: "bg-urg-high",
};

export function UrgencyBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap",
        URGENCY_TEXT_CLASS[level],
        className,
      )}
    >
      <SignalBars />
      緊急度 {URGENCY_LABEL[level]}
    </span>
  );
}

function SignalBars() {
  return (
    <svg width="12" height="11" viewBox="0 0 12 11" aria-hidden className="fill-current">
      <rect x="0" y="6" width="3" height="5" rx="1" />
      <rect x="4.5" y="3" width="3" height="8" rx="1" />
      <rect x="9" y="0" width="3" height="11" rx="1" />
    </svg>
  );
}

const CATEGORY_ICON: Record<Category, React.ComponentType<LucideProps>> = {
  incident: TriangleAlert,
  vehicle: Truck,
  cash: Calculator,
  equipment: MonitorSmartphone,
};

export function CategoryIcon({ category, ...props }: { category: Category } & LucideProps) {
  const Icon = CATEGORY_ICON[category];
  return <Icon aria-hidden {...props} />;
}

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-avatar text-[11px] font-semibold text-navy",
        className,
      )}
      aria-hidden
    >
      {name ? initial(name) : <UserIcon className="size-3" />}
    </span>
  );
}

/** 絞り込み用のチップ */
export function Chip({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "bg-navy text-white" : "bg-chip text-foreground hover:bg-[#EAECF0]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-xl bg-sunken", className)} {...props} />;
}

/** C：白い画面の区切り（上に灰色の帯） */
export function Section({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("border-t-8 border-sunken px-4 py-4", className)} {...props} />;
}
