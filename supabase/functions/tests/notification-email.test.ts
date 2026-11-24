import { test } from "node:test";
import assert from "node:assert/strict";
import { claimUrl, composeEmail } from "../_shared/notification-email.ts";
import { item } from "./fixtures.ts";

const APP = "https://claims.example.com/";

test("件名：イベント・件名・緊急度", () => {
  assert.equal(
    composeEmail(item(), APP).subject,
    "【クレーム管理】承認依頼：レジ金過不足 / みなと中央店（緊急度 中）",
  );
  assert.match(composeEmail(item({ event: "returned" }), APP).subject, /^【クレーム管理】差し戻し：/);
});

test("本文：宛名・依頼文・コメント・項目・リンク", () => {
  const { text, html } = composeEmail(item(), APP);
  assert.match(text, /^田中 一郎 さん\n/);
  assert.match(text, /鈴木 健 さんから承認依頼が届きました/);
  assert.match(text, /■ 担当者からの報告\n確認しました。釣銭トレーの運用を見直します。/);
  assert.match(text, /現場：みなと中央店/);
  assert.match(text, /過不足金額：-1,000円/);
  assert.match(text, /受付番号：CL-20261124-031000-NQ9C/);
  assert.ok(text.includes("https://claims.example.com/claims/CL-20261124-031000-NQ9C"));
  assert.ok(html.includes('href="https://claims.example.com/claims/CL-20261124-031000-NQ9C"'));
});

test("新規報告：担当者と承認者で文面が変わる／コメント欄なし", () => {
  const forApprover = composeEmail(item({ event: "created", message: null, isAssignee: false }), APP).text;
  const forAssignee = composeEmail(item({ event: "created", message: null, isAssignee: true }), APP).text;
  assert.match(forApprover, /あなたはこの報告の承認者です/);
  assert.match(forAssignee, /あなたが担当者に設定されました/);
  assert.doesNotMatch(forApprover, /■ 担当者からの報告/);
});

test("差し戻し：理由の見出し", () => {
  const { text } = composeEmail(item({ event: "returned", actorName: "田中 一郎", message: "金額の内訳を追記してください" }), APP);
  assert.match(text, /田中 一郎 さんが差し戻しました/);
  assert.match(text, /■ 差し戻しの理由\n金額の内訳を追記してください/);
});

test("金額・顧客は値があるときだけ", () => {
  const { text } = composeEmail(item({ claim: { ...item().claim, amount: null, customer: "個人のお客様" } }), APP);
  assert.doesNotMatch(text, /過不足金額/);
  assert.match(text, /顧客：個人のお客様/);
});

test("HTML：入力内容はエスケープされる（タグ・属性を注入できない）", () => {
  const evil = '<script>alert(1)</script><a href="https://evil.example">x</a>';
  const { html } = composeEmail(
    item({ message: evil, claim: { ...item().claim, title: evil, content: evil, site: '"><img src=x onerror=alert(1)>' } }),
    APP,
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('<a href="https://evil.example"'));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("長い内容は省略", () => {
  const { text } = composeEmail(item({ claim: { ...item().claim, content: "あ".repeat(1000) } }), APP);
  assert.ok(text.includes("あ".repeat(400) + "…"));
  assert.ok(!text.includes("あ".repeat(401)));
});

test("リンク：末尾スラッシュ・ID のエンコード", () => {
  assert.equal(claimUrl("https://x.example///", "CL-1/2"), "https://x.example/claims/CL-1%2F2");
});
