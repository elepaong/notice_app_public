import { test } from "node:test";
import assert from "node:assert/strict";
import { processBatch, type WorkerDeps } from "../_shared/email-worker.ts";
import type { SendInput, SendResult } from "../_shared/resend.ts";
import { item } from "./fixtures.ts";

function deps(results: (SendResult | Error)[], overrides: Partial<WorkerDeps> = {}) {
  const sent: SendInput[] = [];
  const finished: [number, SendResult][] = [];
  const sleeps: number[] = [];
  const d: WorkerDeps = {
    claimBatch: async () => results.map((_, i) => item({ id: i + 1, to: `u${i + 1}@example.com` })),
    send: async (input) => {
      sent.push(input);
      const r = results[sent.length - 1];
      if (r instanceof Error) throw r;
      return r;
    },
    finish: async (id, result) => {
      finished.push([id, result]);
    },
    from: "SAMPLE CO. <claims@example.com>",
    appUrl: "https://claims.example.com",
    intervalMs: 600,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...overrides,
  };
  return { d, sent, finished, sleeps };
}

test("1件ずつ送って結果を記録する", async () => {
  const { d, sent, finished, sleeps } = deps([
    { ok: true, id: "re_1" },
    { ok: false, error: "500 x", retryable: true },
    { ok: false, error: "422 bad", retryable: false },
  ]);
  const summary = await processBatch(d);
  assert.deepEqual(summary, { picked: 3, sent: 1, failed: 2, errors: ["#2: 500 x", "#3: 422 bad"] });
  assert.deepEqual(
    finished.map(([id, r]) => [id, r.ok]),
    [
      [1, true],
      [2, false],
      [3, false],
    ],
  );
  assert.deepEqual(
    sent.map((s) => [s.to, s.idempotencyKey]),
    [
      ["u1@example.com", "claim-notification-1"],
      ["u2@example.com", "claim-notification-2"],
      ["u3@example.com", "claim-notification-3"],
    ],
  );
  assert.match(sent[0].subject, /^【クレーム管理】承認依頼：/);
  assert.equal(sent[0].from, "SAMPLE CO. <claims@example.com>");
  assert.deepEqual(sleeps, [600, 600], "1通目の前は待たない");
});

test("送信中の例外は再試行ありの失敗として記録し、残りも送る", async () => {
  const { d, finished } = deps([new Error("boom"), { ok: true, id: "re_2" }]);
  const summary = await processBatch(d);
  assert.equal(summary.sent, 1);
  assert.deepEqual(finished[0], [1, { ok: false, error: "boom", retryable: true }]);
  assert.equal(finished[1][1].ok, true);
});

test("キューが空なら何もしない", async () => {
  const { d, sent } = deps([]);
  assert.deepEqual(await processBatch(d), { picked: 0, sent: 0, failed: 0, errors: [] });
  assert.equal(sent.length, 0);
});

test("取り出し件数の上限を渡す", async () => {
  let asked = 0;
  const { d } = deps([], { claimBatch: async (limit) => ((asked = limit), []) });
  await processBatch(d, 25);
  assert.equal(asked, 25);
});
