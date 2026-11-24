const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatYen(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("ja-JP")}円`;
}

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomSuffix(len: number, rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
  return s;
}

/** CL-20261026-121057-NQ9C 形式 */
export function claimId(date: Date, rand: () => number = Math.random): string {
  const d = date;
  return `CL-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}-${randomSuffix(4, rand)}`;
}

/** 名前の頭文字（アバター用） */
export function initial(name: string): string {
  return name.trim().charAt(0);
}
