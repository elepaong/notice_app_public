"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ImagePlus, X } from "lucide-react";
import { Chip, URGENCY_TEXT_CLASS } from "@/components/claim-ui";
import { SiteInput } from "@/components/site-input";
import { Button } from "@/components/ui/button";
import {
  APPROVER_ROLE_BY_LEVEL,
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_LEVEL,
  ROLE_LABEL,
  URGENCY_LABEL,
  describeApprovers,
  type Category,
} from "@/lib/domain";
import { toDateInput } from "@/lib/format";
import { fileToDataUrl } from "@/lib/image";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function NewClaimPage() {
  const { me, users, sites, createClaim } = useStore();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<Category | null>(null);
  const [occurredOn, setOccurredOn] = useState(toDateInput(new Date()));
  const [site, setSite] = useState<string>(
    me && sites.includes(me.branch) ? me.branch : "",
  );
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [customer, setCustomer] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [amount, setAmount] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const level = category ? CATEGORY_LEVEL[category] : null;
  const valid = category && site.trim() && content.trim();

  const save = async () => {
    setTried(true);
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      const claim = await createClaim({
      category,
      occurredOn,
      site,
      responsiblePerson,
      customer: category === "incident" ? customer : "",
      assigneeId: assigneeId || null,
      amount: category === "cash" && amount !== "" ? Number(amount) : null,
      content,
      title,
      photos,
      });
      router.replace(`/claims/${claim.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <form
      className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-[calc(2.5rem+var(--safe-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <h2 className="mb-3 text-sm font-semibold">報告の種類</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {category === c && <Check className="size-4" />}
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
        {level ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <span className={cn("mr-1.5 inline-block size-2 rounded-full bg-current", URGENCY_TEXT_CLASS[level])} />
            緊急度: {URGENCY_LABEL[level]}（種類で決まります）・承認者:{" "}
            {site.trim()
              ? describeApprovers({ level, site }, users)
              : `Lv.${level} ${ROLE_LABEL[APPROVER_ROLE_BY_LEVEL[level]]}`}
          </p>
        ) : (
          tried && <p className="mt-2 text-xs text-destructive">種類を選んでください</p>
        )}
      </div>

      <Field label="発生日" filled>
        <input
          type="date"
          value={occurredOn}
          max={toDateInput(new Date())}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="w-full bg-transparent text-base outline-none"
        />
      </Field>

      <SiteInput value={site} onChange={setSite} sites={sites} error={tried && !site.trim()} />

      <Field label="責任者（店長）" filled={!!responsiblePerson}>
        <input
          value={responsiblePerson}
          onChange={(e) => setResponsiblePerson(e.target.value)}
          placeholder="責任者（店長）"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </Field>

      {category === "incident" && (
        <Field label="顧客" filled={!!customer}>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="顧客（例：個人のお客様）"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </Field>
      )}

      <Field label="担当者" filled>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="w-full appearance-none bg-transparent text-base font-semibold outline-none"
        >
          <option value="">未割当</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}（{u.branch}・{ROLE_LABEL[u.role]}）
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2" />
      </Field>

      {category === "cash" && (
        <div>
          <Field label="過不足金額（円）" filled={amount !== ""}>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="過不足金額（円）"
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </Field>
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">不足はマイナス (例: -1000)</p>
        </div>
      )}

      <Field label="経緯・内容 *" filled={!!content} error={tried && !content.trim()} className="items-start">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="経緯・内容 *"
          className="min-h-28 w-full resize-y bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </Field>

      <Field label="件名" filled={!!title}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="件名（任意・空欄なら自動）"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </Field>

      <div>
        <h2 className="mb-3 text-sm font-semibold">写真</h2>
        <div className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`写真 ${i + 1}`} className="size-24 rounded-lg object-cover" />
              <button
                type="button"
                aria-label="削除"
                onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                className="absolute -top-2 -right-2 flex size-6 cursor-pointer items-center justify-center rounded-full bg-foreground text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex size-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#D5D9E1] bg-sunken"
            aria-label="写真を追加"
          >
            <ImagePlus className="size-6 text-muted-foreground" />
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            const urls = await Promise.all(files.map((f) => fileToDataUrl(f)));
            setPhotos((p) => [...p, ...urls]);
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={saving}>
        {saving ? "保存中…" : "保存"}
      </Button>
    </form>
  );
}

function Field({
  label,
  filled,
  error,
  className,
  children,
}: {
  label: string;
  filled?: boolean;
  error?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-12 flex-col justify-center rounded-lg border border-transparent bg-sunken px-4 py-2 focus-within:border-navy-2",
        error && "border-destructive",
        className,
      )}
    >
      {filled && <span className="text-xs text-muted-foreground">{label}</span>}
      {children}
    </label>
  );
}
