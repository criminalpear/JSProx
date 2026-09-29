const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/nav-history.js"), "utf8"), context);
function visited(...urls) {
  const h = context.createNavHistory();
  for (const url of urls) h.record(url);
  return h;
}
test("ordinary loads append and a repeated load does not duplicate", () => {
  const h = visited("https://a/", "https://b/", "https://b/");
  assert.deepEqual([...h.entries], ["https://a/", "https://b/"]);
  assert.equal(h.index, 1);
  assert.equal(h.canGoBack(), true);
  assert.equal(h.canGoForward(), false);
});
test("a step only moves the index once its page loads", () => {
  const h = visited("https://a/", "https://b/", "https://c/");
  const back = h.target(-1);
  assert.deepEqual({ ...back }, { index: 1, url: "https://b/" });
  // Navigation not started yet (for example the dashboard was busy): nothing moves.
  assert.equal(h.index, 2);
  h.expect(back.index);
  h.record("https://b/");
  assert.equal(h.index, 1);
  assert.equal(h.canGoForward(), true);
});
test("a redirect during back navigation keeps forward history", () => {
  const h = visited("http://a/", "https://b/", "https://c/");
  h.expect(0);
  h.record("https://a/");
  assert.deepEqual([...h.entries], ["https://a/", "https://b/", "https://c/"]);
  assert.equal(h.index, 0);
  assert.deepEqual({ ...h.target(1) }, { index: 1, url: "https://b/" });
});
test("a new page after going back replaces forward history", () => {
  const h = visited("https://a/", "https://b/", "https://c/");
  h.expect(0);
  h.record("https://a/");
  h.record("https://d/");
  assert.deepEqual([...h.entries], ["https://a/", "https://d/"]);
  assert.equal(h.canGoForward(), false);
});
test("cancel drops a pending step and the list stays bounded", () => {
  const h = context.createNavHistory(3);
  h.record("https://a/");
  h.record("https://b/");
  h.expect(0);
  h.cancel();
  h.record("https://c/");
  assert.deepEqual([...h.entries], ["https://a/", "https://b/", "https://c/"]);
  h.record("https://d/");
  assert.deepEqual([...h.entries], ["https://b/", "https://c/", "https://d/"]);
  assert.equal(h.index, 2);
  assert.equal(h.target(1), null);
  assert.equal(context.createNavHistory().target(-1), null);
});
