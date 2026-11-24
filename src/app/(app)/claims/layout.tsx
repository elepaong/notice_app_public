"use client";

import { usePathname } from "next/navigation";
import { ClaimList } from "@/components/claim-list";
import { cn } from "@/lib/utils";

export default function ClaimsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIndex = pathname === "/claims";
  const selectedId = isIndex ? undefined : decodeURIComponent(pathname.split("/")[2] ?? "");

  return (
    <div className="lg:flex">
      <aside
        className={cn(
          "lg:sticky lg:top-[var(--header-h)] lg:h-[calc(100dvh-var(--header-h))] lg:w-[420px] lg:shrink-0 lg:overflow-y-auto lg:border-r",
          !isIndex && "hidden lg:block",
        )}
      >
        <ClaimList selectedId={selectedId} />
      </aside>
      <div className={cn("min-w-0 flex-1", isIndex && "hidden lg:block")}>{children}</div>
    </div>
  );
}
