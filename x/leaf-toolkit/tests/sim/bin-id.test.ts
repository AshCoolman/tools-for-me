import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBinId } from "../../src/sim/core/partition-core.js";

test("computeBinId returns 6-hex string", () => {
  const id = computeBinId(["a", "b", "c"]);
  assert.match(id, /^[0-9a-f]{6}$/);
});

test("computeBinId is deterministic for equal input", () => {
  const a = computeBinId(["foo/x.ts", "foo/y.ts", "foo/z.ts"]);
  const b = computeBinId(["foo/x.ts", "foo/y.ts", "foo/z.ts"]);
  assert.equal(a, b);
});

test("computeBinId differs for different inputs", () => {
  const a = computeBinId(["foo/x.ts", "foo/y.ts"]);
  const b = computeBinId(["foo/x.ts", "foo/z.ts"]);
  assert.notEqual(a, b);
});

test("computeBinId is order-sensitive (caller must sort)", () => {
  const sorted = computeBinId(["a", "b", "c"]);
  const reversed = computeBinId(["c", "b", "a"]);
  assert.notEqual(sorted, reversed);
});

test("computeBinId on empty input is stable", () => {
  const a = computeBinId([]);
  const b = computeBinId([]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{6}$/);
});
