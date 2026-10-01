import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, readFile } from "node:fs/promises";
import { createAcpExtension } from "../src/index.js";
import { tmpPath } from "./tmp-path.js";

function captureApi() {
  const handlers = new Map<string, ((event: any, ctx: any) => any)[]>();
  const api = {
    on(event: string, handler: (e: any, ctx: any) => any) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    tools: [] as any[],
    commands: new Map<string, any>(),
    registerTool(tool: any) { this.tools.push(tool); },
    registerCommand(name: string, options: any) { this.commands.set(name, options); },
  };
  return { api, handlers };
}

// 1x1 PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const filler = (n: string) => `filler ${n} `.repeat(400);
const userText = (id: string, text: string) => ({ type: "message", id, parentId: null, timestamp: "", message: { role: "user", content: text, timestamp: Date.now() } });
const userImage = (id: string, caption: string, n = 1) => ({
  type: "message", id, parentId: null, timestamp: "",
  message: { role: "user", content: [{ type: "text", text: caption + " " + "detail ".repeat(1000) }, ...Array.from({ length: n }, () => ({ type: "image", data: PNG, mimeType: "image/png" }))], timestamp: Date.now() },
});

function fakeCtx(entries: any[], stateFile: string) {
  return {
    mode: "rpc", hasUI: false,
    ui: { notify: () => {}, confirm: async () => true, select: async () => undefined, input: async () => "", setStatus: () => {} },
    model: { contextWindow: 200_000, input: ["text", "image"] },
    sessionManager: { getBranch: () => entries, getEntries: () => entries, getSessionId: () => "img-session", getSessionFile: () => stateFile },
  };
}

async function setup(imageCount = 1) {
  const { api, handlers } = captureApi();
  createAcpExtension({ modelContextLimit: 200_000 })(api as any);
  const stateFile = tmpPath(`pai-acp-decompress-images-${imageCount}.session.json`);
  await rm(`${stateFile}.acp.json`, { force: true });
  const entries = [
    userText("e1", filler("one")),
    userImage("e2", "Screenshot of the scrollback bug", imageCount), ...["3", "4", "5", "6", "7", "8", "9", "10", "11"].map((n) => userText(`e${n}`, filler(n))),
  ];
  const ctx = fakeCtx(entries, stateFile);
  const ctxHandler = handlers.get("context")![0]!;
  const before = await ctxHandler({ type: "context", messages: entries.map((e) => e.message) }, ctx);
  const compressTool = api.tools.find((t: any) => t.name === "compress")!;
  const compressRes: any = await compressTool.execute("tc1",
    { content: [{ startId: "m00002", endId: "m00002", summary: "User pasted a screenshot of the scrollback bug with notes." }] },
    undefined, undefined, ctx);
  const after = await ctxHandler({ type: "context", messages: entries.map((e) => e.message) }, ctx);
  const decompressTool = api.tools.find((t: any) => t.name === "decompress")!;
  return { decompressTool, ctx, compressRes, before, after };
}

const hasImage = (messages: any[]) => messages.some((m) => Array.isArray(m?.content) && m.content.some((b: any) => b?.type === "image"));

test("folding an image message removes the image from the projected context", async () => {
  const { before, after } = await setup();
  const beforeMsgs = before?.messages ?? [];
  assert.ok(hasImage(beforeMsgs), "image present before fold");
  assert.ok(!hasImage(after.messages), "image gone after fold");
});

test("compress result names the folded image refs and how to restore them", async () => {
  const { compressRes } = await setup();
  const text = compressRes.content[0].text as string;
  assert.match(text, /b1 folded 1 image\(s\) from m00002/);
  assert.match(text, /decompress\(\{ blockId: "m00002" \}\)/);
});

test("decompress by mNNNNN message ref returns the original image as an image block", async () => {
  const { decompressTool, ctx } = await setup();
  const res = await decompressTool.execute("tc2", { blockId: "m00002" }, undefined, undefined, ctx);
  assert.equal(res.content[0].type, "text");
  assert.match(res.content[0].text, /Screenshot of the scrollback bug/);
  assert.match(res.content[0].text, /Attached below as image blocks \(#1 ← m00002\)/);
  const images = res.content.filter((b: any) => b.type === "image");
  assert.equal(images.length, 1);
  assert.deepEqual(images[0], { type: "image", data: PNG, mimeType: "image/png" });
});

test("decompress block inline:true attaches images; default (file) writes them to files", async () => {
  const { decompressTool, ctx } = await setup();
  const inline = await decompressTool.execute("tc3", { blockId: "b1", inline: true }, undefined, undefined, ctx);
  assert.equal(inline.content.filter((b: any) => b.type === "image").length, 1);

  const file = await decompressTool.execute("tc4", { blockId: "b1" }, undefined, undefined, ctx);
  assert.equal(file.content.filter((b: any) => b.type === "image").length, 0, "file mode keeps the result cheap");
  const m = /- (\S+\.png) \(from m00002\)/.exec(file.content[0].text);
  assert.ok(m, `image file path reported: ${file.content[0].text}`);
  const bytes = await readFile(m![1]!);
  assert.deepEqual(bytes, Buffer.from(PNG, "base64"), "file holds the original bytes");
});

test("inline image budget spills extra images to files", async () => {
  const { decompressTool, ctx } = await setup(10);
  const res = await decompressTool.execute("tc5", { blockId: "m00002" }, undefined, undefined, ctx);
  assert.equal(res.content.filter((b: any) => b.type === "image").length, 8);
  assert.match(res.content[0].text, /Over the inline image budget/);
  assert.equal((res.content[0].text.match(/\.png \(from m00002\)/g) ?? []).length, 2);
});

test("decompress of a text-only message returns no image blocks (unchanged behavior)", async () => {
  const { api, handlers } = captureApi();
  createAcpExtension({ modelContextLimit: 200_000 })(api as any);
  const stateFile = tmpPath("pai-acp-decompress-images-text.session.json");
  await rm(`${stateFile}.acp.json`, { force: true });
  const entries = [userText("e1", filler("1")), userText("e2", "plain ".repeat(1500)), ...["3", "4", "5", "6", "7", "8", "9", "10", "11"].map((n) => userText(`e${n}`, filler(n)))];
  const ctx = fakeCtx(entries, stateFile);
  await handlers.get("context")![0]!({ type: "context", messages: [] }, ctx);
  await api.tools.find((t: any) => t.name === "compress")!.execute("tc1",
    { content: [{ startId: "m00002", endId: "m00002", summary: "Plain text message used to check decompress keeps text-only output." }] }, undefined, undefined, ctx);
  const res = await api.tools.find((t: any) => t.name === "decompress")!.execute("tc2", { blockId: "m00002" }, undefined, undefined, ctx);
  assert.equal(res.content.length, 1);
  assert.doesNotMatch(res.content[0].text, /Images:/);
});
