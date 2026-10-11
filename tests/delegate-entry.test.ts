import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { delegateSpawnCommand, resolvePiCliEntry } from "../src/delegate-tool.js";

const REL = join("@earendil-works", "pi-coding-agent", "dist", "cli.js");

/** A machine with pi installed under /usr/* would defeat the fallback test. */
function globalPiInstalled(): boolean {
  if (process.platform === "win32") return false;
  return ["/usr/local/lib", "/usr/lib"].some((p) => existsSync(join(p, "node_modules", REL)));
}

// Fixtures must have NO node_modules ancestor, or the upward pi probe finds a
// real install and defeats the fallback-under-test (#545: $TMPDIR inside a repo tree).
function isolatedRoot(): string {
  let base = tmpdir();
  for (;;) {
    let dirty = false;
    for (let d = base; ; ) {
      if (existsSync(join(d, "node_modules"))) { dirty = true; break; }
      const parent = dirname(d);
      if (parent === d) break;
      d = parent;
    }
    if (!dirty) return base;
    const parent = dirname(base);
    if (parent === base) throw new Error(`no node_modules-free ancestor of ${tmpdir()}`);
    base = parent;
  }
}

function makeTree(rel: string): string {
  const base = mkdtempSync(join(isolatedRoot(), "acp-entry-"));
  const cli = join(base, rel);
  mkdirSync(join(cli, ".."), { recursive: true });
  writeFileSync(cli, "");
  return base;
}

test("PI_CLI_PATH env overrides everything, even when argv[1] is the pi CLI", () => {
  const argv1 = join("node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");
  const explicit = join("custom", "pi", "cli.js");
  assert.equal(
    resolvePiCliEntry(argv1, { PI_CLI_PATH: explicit }, true),
    explicit,
  );
});

test("argv[1] matching the pi CLI path is used as-is (CLI host, no fs probing)", () => {
  const posixPath = "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
  assert.equal(resolvePiCliEntry(posixPath, {}, true), posixPath);

  const winPath = "C:\\Users\\dev\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js";
  assert.equal(resolvePiCliEntry(winPath, {}, true), winPath);
});

test("embedded host probes upward from argv[1] (pi-web: next bin finds pi-coding-agent)", () => {
  const base = makeTree(join("app", "node_modules", REL));
  const nextBin = join(base, "app", "node_modules", "next", "dist", "bin", "next");
  try {
    const expected = join(base, "app", "node_modules", REL);
    assert.equal(resolvePiCliEntry(nextBin, {}, true), expected);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("global install candidates are probed when upward probe fails", () => {
  const base = mkdtempSync(join(isolatedRoot(), "acp-entry-global-"));
  try {
    let env: NodeJS.ProcessEnv;
    let expected: string;
    if (process.platform === "win32") {
      expected = join(base, "npm", "node_modules", REL);
      mkdirSync(join(expected, ".."), { recursive: true });
      writeFileSync(expected, "");
      env = { APPDATA: base };
    } else {
      expected = join(base, ".local", "lib", "node_modules", REL);
      mkdirSync(join(expected, ".."), { recursive: true });
      writeFileSync(expected, "");
      env = { HOME: base };
    }
    const argv1 = join(base, "host", "bin", "server.js");
    assert.equal(resolvePiCliEntry(argv1, env, true), expected);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("unresolvable pi host falls back to argv[1] (never worse than status quo)", { skip: globalPiInstalled() }, () => {
  const argv1 = join(isolatedRoot(), "acp-entry-nohit", "bin", "server.js");
  assert.equal(resolvePiCliEntry(argv1, {}, true), argv1);
});

test("non-pi host (omp) keeps argv[1] untouched - probing is pi-host only", () => {
  const argv1 = join("omp", "dist", "cli.js");
  assert.equal(resolvePiCliEntry(argv1, {}, false), argv1);
});

test("PI_CLI_PATH still overrides on non-pi hosts (explicit user choice)", () => {
  const explicit = join("custom", "pi", "cli.js");
  assert.equal(
    resolvePiCliEntry(join("omp", "dist", "cli.js"), { PI_CLI_PATH: explicit }, false),
    explicit,
  );
});

test("compiled Pi host restarts directly with no CLI entry", () => {
  const cliArgs = ["--mode", "json", "-p"];
  const base = { bunVersion: "1.4.2", env: {}, isPi: true, cliArgs };
  assert.deepEqual(
    delegateSpawnCommand({ ...base, argv1: "/$bunfs/root/pi", execPath: "/opt/pi/pi" }),
    { command: "/opt/pi/pi", args: cliArgs },
  );
  assert.deepEqual(
    delegateSpawnCommand({ ...base, argv1: "/$bunfs/root/pi", execPath: "/opt/bolt/pi-bin", exists: (p) => p === "/opt/bolt/pi" }),
    { command: "/opt/bolt/pi", args: cliArgs },
    "Pi-Bolt children go through the launcher beside pi-bin",
  );
  assert.deepEqual(
    delegateSpawnCommand({ ...base, argv1: "/$bunfs/root/pi", execPath: "/opt/bolt/pi-bin", exists: () => false }),
    { command: "/opt/bolt/pi-bin", args: cliArgs },
  );
});

test("Node-hosted Pi keeps the CLI entry", () => {
  const argv1 = "/x/node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
  assert.deepEqual(
    delegateSpawnCommand({ argv1, execPath: "/usr/bin/node", bunVersion: undefined, env: {}, isPi: true, cliArgs: ["-p"] }),
    { command: "/usr/bin/node", args: [argv1, "-p"] },
  );
});
