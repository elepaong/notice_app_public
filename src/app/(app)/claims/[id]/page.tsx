"use client";

import { use } from "react";
import Link from "next/link";
import { ClaimDetail } from "@/components/claim-detail";
import { useStore } from "@/lib/store";

export default function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { claims } = useStore();
  const claim = claims.find((c) => c.id === decodeURIComponent(id));
  if (!claim) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        クレームが見つかりません。
        <Link href="/claims" className="ml-2 text-navy-2 underline">
          一覧へ戻る
        </Link>
      </div>
    );
  }
  return <ClaimDetail claim={claim} />;
}
