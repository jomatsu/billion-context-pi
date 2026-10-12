import { test } from "node:test";
import assert from "node:assert/strict";
import { hostUsageAnchor } from "../src/floor-stale.js";

const msg = (id: string, message: Record<string, unknown>) => ({
  type: "message", id, parentId: null, timestamp: "", message: { timestamp: 0, ...message },
});
const assistant = (id: string, input: number, over: Record<string, unknown> = {}) =>
  msg(id, { role: "assistant", content: "ok", usage: { input, output: 100, cacheRead: 0, cacheWrite: 0 }, ...over });
const edit = (id: string, targetId: string) => ({ type: "context_edit", id, parentId: null, timestamp: "", targetId, replacement: null });

test("anchored: last valid usage after every context_edit", () => {
  const r = hostUsageAnchor([assistant("a1", 1000), edit("x", "a1"), assistant("a2", 200_000)]);
  assert.deepEqual(r, { unanchored: false, anchorTokens: 200_100 });
});

test("unanchored: pi omitted a failed attempt after the last usage", () => {
  const r = hostUsageAnchor([
    assistant("a1", 214_000),
    msg("u", { role: "user", content: "go" }),
    assistant("a2", 0, { stopReason: "error", usage: undefined }),
    edit("x", "a2"),
  ]);
  assert.deepEqual(r, { unanchored: true, anchorTokens: 214_100 });
});

test("no usage at all: no anchor tokens", () => {
  const r = hostUsageAnchor([msg("u", { role: "user", content: "go" }), edit("x", "u")]);
  assert.deepEqual(r, { unanchored: true, anchorTokens: 0 });
});
