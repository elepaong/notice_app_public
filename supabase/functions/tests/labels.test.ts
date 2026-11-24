import { test } from "node:test";
import assert from "node:assert/strict";
import * as app from "../../../src/lib/domain.ts";
import * as fn from "../_shared/labels.ts";

test("Edge Function のラベルがアプリと一致している", () => {
  assert.deepEqual(fn.CATEGORY_LABEL, app.CATEGORY_LABEL);
  assert.deepEqual(fn.URGENCY_LABEL, app.URGENCY_LABEL);
  assert.deepEqual(fn.STATUS_LABEL, app.STATUS_LABEL);
  assert.deepEqual(fn.NOTIFICATION_EVENT_LABEL, app.NOTIFICATION_EVENT_LABEL);
});
