// Resend（メール送信サービス）への送信。fetch だけを使うので Deno / Node どちらでも動く

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

export type SendInput = { from: string; to: string; subject: string; text: string; html: string; idempotencyKey: string };

export function createResendSender(apiKey: string, endpoint = "https://api.resend.com/emails") {
  return async (input: SendInput): Promise<SendResult> => {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // 再試行で同じメールが二重に届かないように
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from: input.from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
    } catch (e) {
      return { ok: false, error: `通信エラー: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
    }
    const body = await res.text();
    if (res.ok) {
      let id = "";
      try {
        id = (JSON.parse(body) as { id?: string }).id ?? "";
      } catch {
        /* id なしでも成功扱い */
      }
      return { ok: true, id };
    }
    // 400/422：宛先や内容が不正 → 再送しても同じなので打ち切り。それ以外（429・5xx・認証）は再試行
    const retryable = !(res.status === 400 || res.status === 422);
    return { ok: false, error: `${res.status} ${body.slice(0, 500)}`, retryable };
  };
}
