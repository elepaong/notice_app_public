// 送信キューの処理（DB や送信サービスは引数で受け取る → テストで差し替えられる）

import { composeEmail, type OutboxItem } from "./notification-email.ts";
import type { SendInput, SendResult } from "./resend.ts";

export type WorkerDeps = {
  claimBatch: (limit: number) => Promise<OutboxItem[]>;
  finish: (id: number, result: SendResult) => Promise<void>;
  send: (input: SendInput) => Promise<SendResult>;
  from: string;
  appUrl: string;
  /** 1通ごとの待ち時間（送信サービスのレート制限対策） */
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type WorkerSummary = { picked: number; sent: number; failed: number; errors: string[] };

export async function processBatch(deps: WorkerDeps, limit = 40): Promise<WorkerSummary> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const items = await deps.claimBatch(limit);
  const summary: WorkerSummary = { picked: items.length, sent: 0, failed: 0, errors: [] };

  for (const [i, item] of items.entries()) {
    if (i > 0 && deps.intervalMs) await sleep(deps.intervalMs);
    let result: SendResult;
    try {
      const mail = composeEmail(item, deps.appUrl);
      result = await deps.send({
        from: deps.from,
        to: item.to,
        ...mail,
        idempotencyKey: `claim-notification-${item.id}`,
      });
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
    }
    if (result.ok) summary.sent++;
    else {
      summary.failed++;
      summary.errors.push(`#${item.id}: ${result.error}`);
    }
    await deps.finish(item.id, result);
  }
  return summary;
}
