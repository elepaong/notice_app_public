import { FileText } from "lucide-react";

/** デスクトップ時、右側に表示されるプレースホルダー */
export default function ClaimsIndex() {
  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileText className="size-10" />
      <p className="text-sm">左の一覧からクレームを選択してください</p>
    </div>
  );
}
