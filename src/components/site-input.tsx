"use client";

import { useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { normalizeSite } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * 現場の自由入力。登録済みの現場を入力候補として表示する（一覧にない現場名もそのまま使える）。
 */
export function SiteInput({
  value,
  onChange,
  sites,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  sites: string[];
  error?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const key = normalizeSite(value);
  const exact = sites.some((s) => normalizeSite(s) === key);
  const suggestions = useMemo(() => {
    if (!key) return sites.slice(0, 8);
    return sites.filter((s) => normalizeSite(s).includes(key) && normalizeSite(s) !== key).slice(0, 8);
  }, [sites, key]);
  const show = open && suggestions.length > 0;

  const choose = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative">
      <label
        className={cn(
          "relative flex min-h-12 flex-col justify-center rounded-lg border border-transparent bg-sunken px-4 py-2 focus-within:border-navy-2",
          error && "border-destructive",
        )}
      >
        {value && <span className="text-xs text-muted-foreground">現場 *</span>}
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!show) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(suggestions[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="現場 *（例：みなと中央店）"
          role="combobox"
          aria-label="現場"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </label>
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-card py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[15px] hover:bg-muted",
                i === active && "bg-muted",
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              {s}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 px-1 text-xs leading-relaxed text-muted-foreground">
        {value.trim() && !exact && !open ? (
          <span className="text-st-progress">登録されていない現場名です。このまま登録できます。</span>
        ) : (
          "一覧にない現場もそのまま入力できます。"
        )}
        出張の場合は「出張買取」と入力し、住所は経緯・内容に書いてください。
      </p>
    </div>
  );
}
