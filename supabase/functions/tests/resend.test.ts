import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { createResendSender } from "../_shared/resend.ts";

type Captured = { headers: IncomingMessage["headers"]; body: Record<string, unknown> };

async function withServer(status: number, reply: string, fn: (url: string, captured: Captured[]) => Promise<void>) {
  const captured: Captured[] = [];
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      captured.push({ headers: req.headers, body: JSON.parse(data) });
      res.writeHead(status, { "Content-Type": "application/json" }).end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/emails`, captured);
  } finally {
    server.close();
  }
}

const input = {
  from: "クレーム管理システム <claims@example.com>",
  to: "tanaka@example.com",
  subject: "件名",
  text: "本文",
  html: "<p>本文</p>",
  idempotencyKey: "claim-notification-42",
};

test("成功：API キー・二重送信防止キー・宛先を送り、ID を返す", async () => {
  await withServer(200, '{"id":"re_123"}', async (url, captured) => {
    const result = await createResendSender("re_test_key", url)(input);
    assert.deepEqual(result, { ok: true, id: "re_123" });
    assert.equal(captured[0].headers.authorization, "Bearer re_test_key");
    assert.equal(captured[0].headers["idempotency-key"], "claim-notification-42");
    assert.deepEqual(captured[0].body, {
      from: input.from,
      to: ["tanaka@example.com"],
      subject: "件名",
      text: "本文",
      html: "<p>本文</p>",
    });
  });
});

for (const [status, retryable] of [
  [422, false],
  [400, false],
  [429, true],
  [500, true],
  [401, true],
] as const) {
  test(`失敗 ${status}：再試行${retryable ? "する" : "しない"}`, async () => {
    await withServer(status, '{"message":"x"}', async (url) => {
      const result = await createResendSender("k", url)(input);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.retryable, retryable);
      assert.match(!result.ok ? result.error : "", new RegExp(`^${status} `));
    });
  });
}

test("通信エラーは再試行する", async () => {
  const result = await createResendSender("k", "http://127.0.0.1:1/emails")(input);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.retryable, true);
  assert.match(!result.ok ? result.error : "", /^通信エラー/);
});
